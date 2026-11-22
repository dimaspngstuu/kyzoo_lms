const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const DB = require('../db');
const { requireAdmin } = require('../middleware/auth');

// Pastikan hanya role Admin yang bisa masuk
router.use(requireAdmin);

// Konfigurasi Multer untuk Upload Video dan Thumbnail
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === 'video_file') {
      const dir = path.join(__dirname, '../public/uploads/videos');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } else {
      const dir = path.join(__dirname, '../public/uploads/thumbnails');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 } // Batas upload hingga 500MB
});

// Helper Generate Kode Unik Kursus: CRS-YYYYMM-XXX
function generateCourseCode() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `CRS-${year}${month}-`;

  const lastRecord = DB.get(
    `SELECT code FROM courses WHERE code LIKE ? ORDER BY id DESC LIMIT 1`,
    `${prefix}%`
  );

  let nextNum = 1;
  if (lastRecord && lastRecord.code) {
    const parts = lastRecord.code.split('-');
    if (parts.length === 3) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed)) nextNum = parsed + 1;
    }
  }

  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

// Helper Generate Slug Unik
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

// 1. Dashboard Admin
router.get('/admin', (req, res) => {
  const totalCourses = DB.get('SELECT COUNT(*) as count FROM courses').count;
  const totalChapters = DB.get('SELECT COUNT(*) as count FROM chapters').count;
  const totalLessons = DB.get('SELECT COUNT(*) as count FROM lessons').count;
  const totalUsers = DB.get('SELECT COUNT(1) as count FROM users WHERE role = ?', 'pelanggan').count;

  const courses = DB.all(`
    SELECT c.*, 
      (SELECT COUNT(*) FROM chapters ch WHERE ch.course_id = c.id) as chapters_count,
      (SELECT COUNT(*) FROM chapters ch JOIN lessons l ON l.chapter_id = ch.id WHERE ch.course_id = c.id) as lessons_count
    FROM courses c
    ORDER BY c.id DESC
  `);

  res.render('admin/dashboard', {
    title: 'Panel Admin Kelola Materi - Kyzoo LMS',
    user: req.session.user,
    stats: { totalCourses, totalChapters, totalLessons, totalUsers },
    courses,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

// 2. Form Tambah Kursus Baru
router.get('/admin/courses/new', (req, res) => {
  res.render('admin/course_form', {
    title: 'Tambah Kursus Baru - Kyzoo Admin',
    user: req.session.user,
    course: null,
    generatedCode: generateCourseCode(),
    error: null
  });
});

// 3. Proses Simpan Kursus Baru
router.post('/admin/courses/new', upload.single('thumbnail_file'), (req, res) => {
  try {
    const { title, category, description, custom_thumbnail } = req.body;
    if (!title || !category) {
      return res.render('admin/course_form', {
        title: 'Tambah Kursus Baru - Kyzoo Admin',
        user: req.session.user,
        course: req.body,
        generatedCode: generateCourseCode(),
        error: 'Judul kursus dan kategori wajib diisi!'
      });
    }

    const code = generateCourseCode();
    let baseSlug = slugify(title);
    let finalSlug = baseSlug;
    let counter = 1;
    while (DB.get('SELECT id FROM courses WHERE slug = ?', finalSlug)) {
      finalSlug = `${baseSlug}-${counter}`;
      counter++;
    }

    let thumbnail = custom_thumbnail || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80';
    if (req.file) {
      thumbnail = `/uploads/thumbnails/${req.file.filename}`;
    }

    DB.run(`
      INSERT INTO courses (code, title, slug, category, description, thumbnail, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `, code, title.trim(), finalSlug, category.trim(), description ? description.trim() : '', thumbnail);

    res.redirect('/admin?success=Kursus+baru+berhasil+dibuat!');
  } catch (err) {
    console.error(err);
    res.redirect('/admin?error=' + encodeURIComponent(err.message));
  }
});

// 4. Form Edit Kursus
router.get('/admin/courses/:id/edit', (req, res) => {
  const course = DB.get('SELECT * FROM courses WHERE id = ?', req.params.id);
  if (!course) return res.redirect('/admin?error=Kursus+tidak+ditemukan');

  res.render('admin/course_form', {
    title: `Edit ${course.title} - Kyzoo Admin`,
    user: req.session.user,
    course,
    generatedCode: course.code,
    error: null
  });
});

// 5. Proses Update Kursus
router.post('/admin/courses/:id/edit', upload.single('thumbnail_file'), (req, res) => {
  const course = DB.get('SELECT * FROM courses WHERE id = ?', req.params.id);
  if (!course) return res.redirect('/admin?error=Kursus+tidak+ditemukan');

  const { title, category, description, custom_thumbnail, is_active } = req.body;

  let thumbnail = course.thumbnail;
  if (req.file) {
    thumbnail = `/uploads/thumbnails/${req.file.filename}`;
  } else if (custom_thumbnail) {
    thumbnail = custom_thumbnail.trim();
  }

  DB.run(`
    UPDATE courses 
    SET title = ?, category = ?, description = ?, thumbnail = ?, is_active = ?
    WHERE id = ?
  `, title.trim(), category.trim(), description ? description.trim() : '', thumbnail, is_active ? 1 : 0, course.id);

  res.redirect('/admin?success=Perubahan+kursus+berhasil+disimpan!');
});

// 6. Hapus Kursus
router.post('/admin/courses/:id/delete', (req, res) => {
  DB.run('DELETE FROM courses WHERE id = ?', req.params.id);
  res.redirect('/admin?success=Kursus+dan+semua+materinya+berhasil+dihapus!');
});

// 7. Kelola Episode & Materi Kursus (Linear Tanpa Bab)
router.get('/admin/courses/:id/curriculum', (req, res) => {
  const course = DB.get('SELECT * FROM courses WHERE id = ?', req.params.id);
  if (!course) return res.redirect('/admin?error=Kursus+tidak+ditemukan');

  // Ambil seluruh episode materi secara linear
  const lessons = DB.all(`
    SELECT l.*, ch.title as chapter_title 
    FROM lessons l 
    JOIN chapters ch ON l.chapter_id = ch.id 
    WHERE ch.course_id = ? 
    ORDER BY ch.sort_order ASC, l.sort_order ASC, l.id ASC
  `, course.id);

  res.render('admin/curriculum', {
    title: `Kelola Materi: ${course.title} - Kyzoo Admin`,
    user: req.session.user,
    course,
    lessons,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

// 8. Tambah Episode Baru ke Kursus
router.post('/admin/courses/:id/episodes/new', upload.single('video_file'), (req, res) => {
  const courseId = req.params.id;
  const course = DB.get('SELECT * FROM courses WHERE id = ?', courseId);
  if (!course) return res.redirect('/admin?error=Kursus+tidak+ditemukan');

  const { title, has_video, video_source, video_url, content_text, duration_minutes } = req.body;
  if (!title || !title.trim()) {
    return res.redirect(`/admin/courses/${courseId}/curriculum?error=Judul+episode+wajib+diisi`);
  }

  // Pastikan ada chapter penampung episode di database
  let chapter = DB.get('SELECT id FROM chapters WHERE course_id = ? ORDER BY id ASC LIMIT 1', courseId);
  if (!chapter) {
    const result = DB.run('INSERT INTO chapters (course_id, title, sort_order) VALUES (?, ?, ?)', courseId, 'Episode Silabus', 1);
    chapter = { id: result.lastInsertRowid };
  }

  let finalVideoUrl = '';
  let finalSource = 'youtube';

  if (has_video === 'yes' || has_video === '1') {
    if (req.file) {
      finalSource = 'upload';
      finalVideoUrl = `/uploads/videos/${req.file.filename}`;
    } else if (video_url && video_url.trim()) {
      finalSource = video_source || 'youtube';
      finalVideoUrl = video_url.trim();
    }
  }

  const lastOrder = DB.get('SELECT MAX(l.sort_order) as max_order FROM lessons l JOIN chapters ch ON l.chapter_id = ch.id WHERE ch.course_id = ?', courseId);
  const nextOrder = (lastOrder && lastOrder.max_order) ? lastOrder.max_order + 1 : 1;

  DB.run(`
    INSERT INTO lessons (chapter_id, title, video_source, video_url, content_text, duration_minutes, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, chapter.id, title.trim(), finalSource, finalVideoUrl, content_text ? content_text.trim() : '', parseInt(duration_minutes, 10) || 10, nextOrder);

  res.redirect(`/admin/courses/${courseId}/curriculum?success=Episode+baru+berhasil+ditambahkan!`);
});

// 9. Edit Data Episode (Judul, Teori, Video Opsional, Durasi)
router.post('/admin/lessons/:id/edit', upload.single('video_file'), (req, res) => {
  const lesson = DB.get('SELECT l.*, ch.course_id FROM lessons l JOIN chapters ch ON l.chapter_id = ch.id WHERE l.id = ?', req.params.id);
  if (!lesson) return res.redirect('/admin?error=Episode+tidak+ditemukan');

  const { title, has_video, video_source, video_url, content_text, duration_minutes } = req.body;
  if (!title || !title.trim()) {
    return res.redirect(`/admin/courses/${lesson.course_id}/curriculum?error=Judul+episode+wajib+diisi`);
  }

  let finalVideoUrl = '';
  let finalSource = 'youtube';

  if (has_video === 'yes' || has_video === '1') {
    if (req.file) {
      finalSource = 'upload';
      finalVideoUrl = `/uploads/videos/${req.file.filename}`;
    } else if (video_url && video_url.trim()) {
      finalSource = video_source || 'youtube';
      finalVideoUrl = video_url.trim();
    } else if (lesson.video_url) {
      finalSource = lesson.video_source || 'youtube';
      finalVideoUrl = lesson.video_url;
    }
  }

  DB.run(`
    UPDATE lessons 
    SET title = ?, video_source = ?, video_url = ?, content_text = ?, duration_minutes = ?
    WHERE id = ?
  `, title.trim(), finalSource, finalVideoUrl, content_text ? content_text.trim() : '', parseInt(duration_minutes, 10) || 10, lesson.id);

  res.redirect(`/admin/courses/${lesson.course_id}/curriculum?success=Episode+berhasil+diperbarui!`);
});

// 10. Hapus Episode
router.post('/admin/lessons/:id/delete', (req, res) => {
  const lesson = DB.get('SELECT l.*, ch.course_id FROM lessons l JOIN chapters ch ON l.chapter_id = ch.id WHERE l.id = ?', req.params.id);
  if (lesson) {
    DB.run('DELETE FROM lessons WHERE id = ?', req.params.id);
    return res.redirect(`/admin/courses/${lesson.course_id}/curriculum?success=Episode+berhasil+dihapus`);
  }
  res.redirect('/admin');
});

// Legacy Alias Support
router.post('/admin/courses/:id/chapters/new', (req, res) => res.redirect(`/admin/courses/${req.params.id}/curriculum`));
router.post('/admin/chapters/:id/delete', (req, res) => res.redirect('/admin'));
router.post('/admin/chapters/:chapterId/lessons/new', upload.single('video_file'), (req, res) => {
  const chapter = DB.get('SELECT * FROM chapters WHERE id = ?', req.params.chapterId);
  if (!chapter) return res.redirect('/admin?error=Bab+tidak+ditemukan');
  req.params.id = chapter.course_id;
  return router.handle(req, res);
});

// 12. Database Explorer: Tampilkan Data Tabel & Skema
router.get('/admin/database', (req, res) => {
  try {
    const rawTables = DB.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
    `);
    const tables = rawTables.map(t => {
      const countRow = DB.get(`SELECT COUNT(*) as count FROM "${t.name}"`);
      return {
        name: t.name,
        count: countRow ? countRow.count : 0
      };
    });

    const activeTable = req.query.table || (tables.length > 0 ? tables[0].name : null);
    let columns = [];
    let rows = [];

    if (activeTable) {
      const validTable = tables.find(t => t.name === activeTable);
      if (validTable) {
        columns = DB.all(`PRAGMA table_info("${activeTable}")`);
        rows = DB.all(`SELECT * FROM "${activeTable}" ORDER BY rowid DESC LIMIT 100`);
      }
    }

    res.render('admin/database', {
      title: 'Database Explorer - Kyzoo Admin',
      user: req.session.user,
      tables,
      activeTable,
      columns,
      rows,
      queryResult: null,
      customQuery: '',
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('Error in database explorer:', err);
    res.redirect('/admin?error=' + encodeURIComponent(err.message));
  }
});

// 13. Eksekusi Custom SQL Query Langsung
router.post('/admin/database/query', (req, res) => {
  const { sql } = req.body;
  if (!sql || !sql.trim()) {
    return res.redirect('/admin/database?error=Query+SQL+tidak+boleh+kosong');
  }

  const rawTables = DB.all(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name ASC
  `);
  const tables = rawTables.map(t => {
    const countRow = DB.get(`SELECT COUNT(*) as count FROM "${t.name}"`);
    return { name: t.name, count: countRow ? countRow.count : 0 };
  });

  try {
    const trimmed = sql.trim();
    let queryResult = null;
    let message = '';

    if (trimmed.toUpperCase().startsWith('SELECT') || trimmed.toUpperCase().startsWith('PRAGMA')) {
      const rows = DB.all(trimmed);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      queryResult = { rows, columns };
      message = `Query berhasil dieksekusi: ${rows.length} baris data ditemukan.`;
    } else {
      const info = DB.run(trimmed);
      message = `Perintah SQL berhasil dijalankan. Baris yang berubah: ${info.changes || 0}`;
    }

    res.render('admin/database', {
      title: 'Database Explorer - Kyzoo Admin',
      user: req.session.user,
      tables,
      activeTable: null,
      columns: [],
      rows: [],
      queryResult,
      customQuery: trimmed,
      error: null,
      success: message
    });
  } catch (err) {
    res.render('admin/database', {
      title: 'Database Explorer - Kyzoo Admin',
      user: req.session.user,
      tables,
      activeTable: tables.length > 0 ? tables[0].name : null,
      columns: [],
      rows: [],
      queryResult: null,
      customQuery: sql,
      error: 'SQL Error: ' + err.message,
      success: null
    });
  }
});

// 14. Download File Backup Database Langsung
router.get('/admin/database/download', (req, res) => {
  const dbFile = path.join(__dirname, '../data/kyzoo.db');
  if (fs.existsSync(dbFile)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return res.download(dbFile, `kyzoo-backup-${timestamp}.db`);
  }
  res.redirect('/admin/database?error=File+database+tidak+ditemukan');
});

// ==============================================================
// FITUR KELOLA ANGGOTA / PENGGUNA (CRUD) OLEH ADMIN
// ==============================================================

// 15. Tampilkan Halaman Daftar Anggota
router.get('/admin/users', (req, res) => {
  const q = req.query.q ? req.query.q.trim().toLowerCase() : '';
  const filterRole = req.query.role ? req.query.role.trim().toLowerCase() : 'all';
  const success = req.query.success || null;
  const error = req.query.error || null;

  let sql = `
    SELECT u.id, u.name, u.email, u.password, u.role, u.avatar, u.created_at,
           (SELECT COUNT(*) FROM user_progress up WHERE up.user_id = u.id AND up.is_completed = 1) AS completed_lessons
    FROM users u
    WHERE 1=1
  `;
  const params = [];

  if (q) {
    sql += ` AND (LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`);
  }

  if (filterRole === 'pelanggan' || filterRole === 'admin') {
    sql += ` AND u.role = ?`;
    params.push(filterRole);
  }

  sql += ` ORDER BY u.id DESC`;

  const users = DB.all(sql, ...params);

  // Hitung Statistik
  const totalUsers = DB.get('SELECT COUNT(*) as count FROM users').count;
  const totalPelanggan = DB.get("SELECT COUNT(*) as count FROM users WHERE role = 'pelanggan'").count;
  const totalAdmins = DB.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").count;

  res.render('admin/users', {
    title: 'Kelola Anggota - Kyzoo Admin',
    pageTitle: 'Kelola Anggota',
    currentPath: '/admin/users',
    currentUser: req.session.user,
    users,
    stats: {
      totalUsers,
      totalPelanggan,
      totalAdmins
    },
    q,
    filterRole,
    success,
    error
  });
});

// 16. Tambah Anggota Baru
router.post('/admin/users', (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !name.trim() || !email || !email.trim() || !password || !password.trim()) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Nama, email, dan password wajib diisi!'));
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = DB.get('SELECT id FROM users WHERE email = ?', cleanEmail);
    if (existing) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Email sudah digunakan oleh anggota lain!'));
    }

    const cleanRole = (role === 'admin') ? 'admin' : 'pelanggan';
    const cleanName = name.trim();
    const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanName)}`;

    DB.run(
      'INSERT INTO users (name, email, password, role, avatar) VALUES (?, ?, ?, ?, ?)',
      cleanName, cleanEmail, password.trim(), cleanRole, defaultAvatar
    );

    res.redirect('/admin/users?success=' + encodeURIComponent(`Anggota "${cleanName}" berhasil ditambahkan.`));
  } catch (err) {
    console.error('Error tambah anggota:', err);
    res.redirect('/admin/users?error=' + encodeURIComponent('Gagal menambah anggota: ' + err.message));
  }
});

// 17. Edit Data Anggota
router.post('/admin/users/:id/edit', (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { name, email, password, role } = req.body;

    const user = DB.get('SELECT * FROM users WHERE id = ?', userId);
    if (!user) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Anggota tidak ditemukan.'));
    }

    if (!name || !name.trim() || !email || !email.trim()) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Nama dan email tidak boleh kosong!'));
    }

    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== user.email) {
      const existing = DB.get('SELECT id FROM users WHERE email = ? AND id != ?', cleanEmail, userId);
      if (existing) {
        return res.redirect('/admin/users?error=' + encodeURIComponent('Email tersebut sudah dipakai akun lain!'));
      }
    }

    const cleanRole = (role === 'admin') ? 'admin' : 'pelanggan';
    const cleanName = name.trim();

    // Jika password diisi, perbarui password. Jika kosong, pertahankan password lama
    if (password && password.trim().length > 0) {
      DB.run(
        'UPDATE users SET name = ?, email = ?, password = ?, role = ? WHERE id = ?',
        cleanName, cleanEmail, password.trim(), cleanRole, userId
      );
    } else {
      DB.run(
        'UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?',
        cleanName, cleanEmail, cleanRole, userId
      );
    }

    // Jika user yang diedit adalah akun admin yang sedang login, update sesi aktif
    if (req.session.user && req.session.user.id === userId) {
      req.session.user.name = cleanName;
      req.session.user.email = cleanEmail;
      req.session.user.role = cleanRole;
    }

    res.redirect('/admin/users?success=' + encodeURIComponent(`Data anggota "${cleanName}" berhasil diperbarui.`));
  } catch (err) {
    console.error('Error edit anggota:', err);
    res.redirect('/admin/users?error=' + encodeURIComponent('Gagal memperbarui anggota: ' + err.message));
  }
});

// 18. Hapus Anggota
router.post('/admin/users/:id/delete', (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const user = DB.get('SELECT * FROM users WHERE id = ?', userId);

    if (!user) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Anggota tidak ditemukan.'));
    }

    // Proteksi: Admin tidak boleh menghapus akunnya sendiri
    if (req.session.user && req.session.user.id === userId) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif!'));
    }

    // Hapus data progres pengguna dan kode OTP pengguna terlebih dahulu
    DB.run('DELETE FROM user_progress WHERE user_id = ?', userId);
    DB.run('DELETE FROM email_otps WHERE email = ?', user.email);
    DB.run('DELETE FROM users WHERE id = ?', userId);

    res.redirect('/admin/users?success=' + encodeURIComponent(`Akun anggota "${user.name}" (${user.email}) berhasil dihapus.`));
  } catch (err) {
    console.error('Error hapus anggota:', err);
    res.redirect('/admin/users?error=' + encodeURIComponent('Gagal menghapus anggota: ' + err.message));
  }
});

module.exports = router;
