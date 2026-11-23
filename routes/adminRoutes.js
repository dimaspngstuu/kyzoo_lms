const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const DB = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { uploadToStorage } = require('../services/storage');

// Pastikan hanya role Admin yang bisa masuk
router.use(requireAdmin);

// Konfigurasi Multer Memory Storage (Serverless & Supabase Storage Compliant)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 } // Batas upload hingga 500MB
});

// Helper Generate Kode Unik Kursus: CRS-YYYYMM-XXX
async function generateCourseCode() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `CRS-${year}${month}-`;

  const lastRecord = await DB.get(
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
router.get('/admin', async (req, res) => {
  try {
    // Eksekusi seluruh metrik dan daftar kursus secara paralel (High-Speed Zero-Lag)
    const [totalCoursesRow, totalChaptersRow, totalLessonsRow, totalUsersRow, courses] = await Promise.all([
      DB.get('SELECT COUNT(*) as count FROM courses'),
      DB.get('SELECT COUNT(*) as count FROM chapters'),
      DB.get('SELECT COUNT(*) as count FROM lessons'),
      DB.get('SELECT COUNT(1) as count FROM users WHERE role = ?', 'pelanggan'),
      DB.all(`
        SELECT c.*, 
          (SELECT COUNT(*) FROM chapters ch WHERE ch.course_id = c.id) as chapters_count,
          (SELECT COUNT(*) FROM chapters ch JOIN lessons l ON l.chapter_id = ch.id WHERE ch.course_id = c.id) as lessons_count
        FROM courses c
        ORDER BY c.id DESC
      `)
    ]);

    const totalCourses = totalCoursesRow ? parseInt(totalCoursesRow.count, 10) : 0;
    const totalChapters = totalChaptersRow ? parseInt(totalChaptersRow.count, 10) : 0;
    const totalLessons = totalLessonsRow ? parseInt(totalLessonsRow.count, 10) : 0;
    const totalUsers = totalUsersRow ? parseInt(totalUsersRow.count, 10) : 0;

    res.render('admin/dashboard', {
      title: 'Panel Admin Kelola Materi - Kyzoo LMS',
      user: req.session.user,
      stats: { totalCourses, totalChapters, totalLessons, totalUsers },
      courses,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Error admin dashboard:', err);
    res.status(500).render('error', {
      title: 'Kesalahan Sistem Admin',
      message: 'Gagal memuat dashboard admin: ' + err.message,
      statusCode: 500
    });
  }
});

// 2. Form Tambah Kursus Baru
router.get('/admin/courses/new', async (req, res) => {
  try {
    const generatedCode = await generateCourseCode();
    res.render('admin/course_form', {
      title: 'Tambah Kursus Baru - Kyzoo Admin',
      user: req.session.user,
      course: null,
      generatedCode,
      error: null
    });
  } catch (err) {
    console.error('Error course new form:', err);
    res.redirect('/admin?error=' + encodeURIComponent(err.message));
  }
});

// 3. Proses Simpan Kursus Baru
router.post('/admin/courses/new', upload.single('thumbnail_file'), async (req, res) => {
  try {
    const { title, category, description, custom_thumbnail } = req.body;
    if (!title || !category) {
      const generatedCode = await generateCourseCode();
      return res.render('admin/course_form', {
        title: 'Tambah Kursus Baru - Kyzoo Admin',
        user: req.session.user,
        course: req.body,
        generatedCode,
        error: 'Judul kursus dan kategori wajib diisi!'
      });
    }

    const code = await generateCourseCode();
    let baseSlug = slugify(title);
    let finalSlug = baseSlug;
    let counter = 1;
    while (await DB.get('SELECT id FROM courses WHERE slug = ?', finalSlug)) {
      finalSlug = `${baseSlug}-${counter}`;
      counter++;
    }

    let thumbnail = custom_thumbnail || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80';
    if (req.file) {
      thumbnail = await uploadToStorage(req.file, 'thumbnails');
    }

    await DB.run(`
      INSERT INTO courses (code, title, slug, category, description, thumbnail, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `, code, title.trim(), finalSlug, category.trim(), description ? description.trim() : '', thumbnail);

    res.redirect('/admin?success=Kursus+baru+berhasil+dibuat!');
  } catch (err) {
    console.error('Error simpan kursus:', err);
    res.redirect('/admin?error=' + encodeURIComponent(err.message));
  }
});

// 4. Form Edit Kursus
router.get('/admin/courses/:id/edit', async (req, res) => {
  try {
    const course = await DB.get('SELECT * FROM courses WHERE id = ?', req.params.id);
    if (!course) return res.redirect('/admin?error=Kursus+tidak+ditemukan');

    res.render('admin/course_form', {
      title: `Edit ${course.title} - Kyzoo Admin`,
      user: req.session.user,
      course,
      generatedCode: course.code,
      error: null
    });
  } catch (err) {
    console.error('Error edit course form:', err);
    res.redirect('/admin?error=' + encodeURIComponent(err.message));
  }
});

// 5. Proses Update Kursus
router.post('/admin/courses/:id/edit', upload.single('thumbnail_file'), async (req, res) => {
  try {
    const course = await DB.get('SELECT * FROM courses WHERE id = ?', req.params.id);
    if (!course) return res.redirect('/admin?error=Kursus+tidak+ditemukan');

    const { title, category, description, custom_thumbnail, is_active } = req.body;

    let thumbnail = course.thumbnail;
    if (req.file) {
      thumbnail = await uploadToStorage(req.file, 'thumbnails');
    } else if (custom_thumbnail) {
      thumbnail = custom_thumbnail.trim();
    }

    await DB.run(`
      UPDATE courses 
      SET title = ?, category = ?, description = ?, thumbnail = ?, is_active = ?
      WHERE id = ?
    `, title.trim(), category.trim(), description ? description.trim() : '', thumbnail, is_active ? 1 : 0, course.id);

    res.redirect('/admin?success=Perubahan+kursus+berhasil+disimpan!');
  } catch (err) {
    console.error('Error update kursus:', err);
    res.redirect('/admin?error=' + encodeURIComponent(err.message));
  }
});

// 6. Hapus Kursus
router.post('/admin/courses/:id/delete', async (req, res) => {
  try {
    await DB.run('DELETE FROM courses WHERE id = ?', req.params.id);
    res.redirect('/admin?success=Kursus+dan+semua+materinya+berhasil+dihapus!');
  } catch (err) {
    console.error('Error delete kursus:', err);
    res.redirect('/admin?error=' + encodeURIComponent(err.message));
  }
});

// 7. Kelola Episode & Materi Kursus (Linear Tanpa Bab)
router.get('/admin/courses/:id/curriculum', async (req, res) => {
  try {
    const course = await DB.get('SELECT * FROM courses WHERE id = ?', req.params.id);
    if (!course) return res.redirect('/admin?error=Kursus+tidak+ditemukan');

    // Ambil seluruh episode materi secara linear
    const lessons = await DB.all(`
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
  } catch (err) {
    console.error('Error curriculum:', err);
    res.redirect('/admin?error=' + encodeURIComponent(err.message));
  }
});

// Helper Deteksi Tipe Lampiran (Gambar, PPT, PDF, Dokumen)
function detectAttachmentType(url, originalName = '') {
  const target = ((originalName || '') + ' ' + (url || '')).toLowerCase();
  if (target.match(/\.(png|jpg|jpeg|webp|svg|gif)($|\?)/)) {
    return 'image';
  }
  if (target.match(/\.(ppt|pptx|key)($|\?)/) || target.includes('presentation') || target.includes('slides')) {
    return 'ppt';
  }
  if (target.match(/\.pdf($|\?)/)) {
    return 'pdf';
  }
  return 'document';
}

// 8. Tambah Episode Baru ke Kursus (Mendukung Video & Lampiran Gambar/PPT Opsional)
router.post('/admin/courses/:id/episodes/new', upload.fields([
  { name: 'video_file', maxCount: 1 },
  { name: 'attachment_file', maxCount: 1 }
]), async (req, res) => {
  try {
    const courseId = req.params.id;
    const course = await DB.get('SELECT * FROM courses WHERE id = ?', courseId);
    if (!course) return res.redirect('/admin?error=Kursus+tidak+ditemukan');

    const {
      title, has_video, video_source, video_url, content_text, duration_minutes,
      has_attachment, attachment_source, attachment_url, attachment_name
    } = req.body;

    if (!title || !title.trim()) {
      return res.redirect(`/admin/courses/${courseId}/curriculum?error=Judul+episode+wajib+diisi`);
    }

    // Pastikan ada chapter penampung episode di database
    let chapter = await DB.get('SELECT id FROM chapters WHERE course_id = ? ORDER BY id ASC LIMIT 1', courseId);
    if (!chapter) {
      const result = await DB.run('INSERT INTO chapters (course_id, title, sort_order) VALUES (?, ?, ?)', courseId, 'Episode Silabus', 1);
      chapter = { id: result.lastInsertRowid };
    }

    // 1. Penanganan Video (Opsional)
    let finalVideoUrl = '';
    let finalSource = 'youtube';
    const videoFile = req.files && req.files['video_file'] ? req.files['video_file'][0] : null;

    if (has_video === 'yes' || has_video === '1' || has_video === 'on') {
      if (videoFile) {
        finalSource = 'upload';
        finalVideoUrl = await uploadToStorage(videoFile, 'videos');
      } else if (video_url && video_url.trim()) {
        finalSource = video_source || 'youtube';
        finalVideoUrl = video_url.trim();
      }
    }

    // 2. Penanganan Berkas Gambar / Slide PPT / Dokumen (Opsional)
    let finalAttachmentUrl = '';
    let finalAttachmentName = '';
    let finalAttachmentType = '';
    const attachmentFile = req.files && req.files['attachment_file'] ? req.files['attachment_file'][0] : null;

    if (has_attachment === 'yes' || has_attachment === '1' || has_attachment === 'on') {
      if (attachmentFile) {
        finalAttachmentUrl = await uploadToStorage(attachmentFile, 'attachments');
        finalAttachmentName = (attachment_name && attachment_name.trim()) || attachmentFile.originalname;
        finalAttachmentType = detectAttachmentType(finalAttachmentUrl, attachmentFile.originalname);
      } else if (attachment_url && attachment_url.trim()) {
        finalAttachmentUrl = attachment_url.trim();
        finalAttachmentName = (attachment_name && attachment_name.trim()) || 'Berkas Lampiran Materi';
        finalAttachmentType = detectAttachmentType(finalAttachmentUrl, finalAttachmentName);
      }
    }

    const lastOrder = await DB.get('SELECT MAX(l.sort_order) as max_order FROM lessons l JOIN chapters ch ON l.chapter_id = ch.id WHERE ch.course_id = ?', courseId);
    const nextOrder = (lastOrder && lastOrder.max_order) ? parseInt(lastOrder.max_order, 10) + 1 : 1;

    await DB.run(`
      INSERT INTO lessons (
        chapter_id, title, video_source, video_url, content_text, duration_minutes,
        attachment_url, attachment_name, attachment_type, sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      chapter.id,
      title.trim(),
      finalSource,
      finalVideoUrl,
      content_text ? content_text.trim() : '',
      parseInt(duration_minutes, 10) || 10,
      finalAttachmentUrl,
      finalAttachmentName,
      finalAttachmentType,
      nextOrder
    );

    res.redirect(`/admin/courses/${courseId}/curriculum?success=Episode+baru+berhasil+ditambahkan!`);
  } catch (err) {
    console.error('Error add episode:', err);
    res.redirect(`/admin/courses/${req.params.id}/curriculum?error=` + encodeURIComponent(err.message));
  }
});

// 9. Edit Data Episode (Judul, Teori, Video & Lampiran Gambar/PPT)
router.post('/admin/lessons/:id/edit', upload.fields([
  { name: 'video_file', maxCount: 1 },
  { name: 'attachment_file', maxCount: 1 }
]), async (req, res) => {
  try {
    const lesson = await DB.get('SELECT l.*, ch.course_id FROM lessons l JOIN chapters ch ON l.chapter_id = ch.id WHERE l.id = ?', req.params.id);
    if (!lesson) return res.redirect('/admin?error=Episode+tidak+ditemukan');

    const {
      title, has_video, video_source, video_url, content_text, duration_minutes,
      has_attachment, attachment_source, attachment_url, attachment_name
    } = req.body;

    if (!title || !title.trim()) {
      return res.redirect(`/admin/courses/${lesson.course_id}/curriculum?error=Judul+episode+wajib+diisi`);
    }

    // 1. Penanganan Video
    let finalVideoUrl = '';
    let finalSource = 'youtube';
    const videoFile = req.files && req.files['video_file'] ? req.files['video_file'][0] : null;

    if (has_video === 'yes' || has_video === '1' || has_video === 'on') {
      if (videoFile) {
        finalSource = 'upload';
        finalVideoUrl = await uploadToStorage(videoFile, 'videos');
      } else if (video_url && video_url.trim()) {
        finalSource = video_source || 'youtube';
        finalVideoUrl = video_url.trim();
      } else if (lesson.video_url) {
        finalSource = lesson.video_source || 'youtube';
        finalVideoUrl = lesson.video_url;
      }
    }

    // 2. Penanganan Lampiran Gambar / PPT / Dokumen
    let finalAttachmentUrl = '';
    let finalAttachmentName = '';
    let finalAttachmentType = '';
    const attachmentFile = req.files && req.files['attachment_file'] ? req.files['attachment_file'][0] : null;

    if (has_attachment === 'yes' || has_attachment === '1' || has_attachment === 'on') {
      if (attachmentFile) {
        finalAttachmentUrl = await uploadToStorage(attachmentFile, 'attachments');
        finalAttachmentName = (attachment_name && attachment_name.trim()) || attachmentFile.originalname;
        finalAttachmentType = detectAttachmentType(finalAttachmentUrl, attachmentFile.originalname);
      } else if (attachment_url && attachment_url.trim()) {
        finalAttachmentUrl = attachment_url.trim();
        finalAttachmentName = (attachment_name && attachment_name.trim()) || lesson.attachment_name || 'Berkas Lampiran';
        finalAttachmentType = detectAttachmentType(finalAttachmentUrl, finalAttachmentName);
      } else if (lesson.attachment_url) {
        finalAttachmentUrl = lesson.attachment_url;
        finalAttachmentName = (attachment_name && attachment_name.trim()) || lesson.attachment_name || 'Berkas Lampiran';
        finalAttachmentType = lesson.attachment_type || detectAttachmentType(finalAttachmentUrl, finalAttachmentName);
      }
    }

    await DB.run(`
      UPDATE lessons 
      SET title = ?, video_source = ?, video_url = ?, content_text = ?, duration_minutes = ?,
          attachment_url = ?, attachment_name = ?, attachment_type = ?
      WHERE id = ?
    `,
      title.trim(),
      finalSource,
      finalVideoUrl,
      content_text ? content_text.trim() : '',
      parseInt(duration_minutes, 10) || 10,
      finalAttachmentUrl,
      finalAttachmentName,
      finalAttachmentType,
      lesson.id
    );

    res.redirect(`/admin/courses/${lesson.course_id}/curriculum?success=Episode+berhasil+diperbarui!`);
  } catch (err) {
    console.error('Error edit episode:', err);
    res.redirect('/admin?error=' + encodeURIComponent(err.message));
  }
});

// 10. Hapus Episode
router.post('/admin/lessons/:id/delete', async (req, res) => {
  try {
    const lesson = await DB.get('SELECT l.*, ch.course_id FROM lessons l JOIN chapters ch ON l.chapter_id = ch.id WHERE l.id = ?', req.params.id);
    if (lesson) {
      await DB.run('DELETE FROM lessons WHERE id = ?', req.params.id);
      return res.redirect(`/admin/courses/${lesson.course_id}/curriculum?success=Episode+berhasil+dihapus`);
    }
    res.redirect('/admin');
  } catch (err) {
    console.error('Error delete episode:', err);
    res.redirect('/admin?error=' + encodeURIComponent(err.message));
  }
});

// Legacy Alias Support
router.post('/admin/courses/:id/chapters/new', (req, res) => res.redirect(`/admin/courses/${req.params.id}/curriculum`));
router.post('/admin/chapters/:id/delete', (req, res) => res.redirect('/admin'));
router.post('/admin/chapters/:chapterId/lessons/new', upload.single('video_file'), async (req, res) => {
  const chapter = await DB.get('SELECT * FROM chapters WHERE id = ?', req.params.chapterId);
  if (!chapter) return res.redirect('/admin?error=Bab+tidak+ditemukan');
  req.params.id = chapter.course_id;
  return router.handle(req, res);
});

// 12. Database Explorer: Tampilkan Data Tabel & Skema
router.get('/admin/database', async (req, res) => {
  try {
    let rawTables = [];
    if (DB.isPostgres) {
      rawTables = await DB.all(`
        SELECT table_name as name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name ASC
      `);
    } else {
      rawTables = await DB.all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name ASC
      `);
    }

    const tables = [];
    for (const t of rawTables) {
      const countRow = await DB.get(`SELECT COUNT(*) as count FROM "${t.name}"`);
      tables.push({
        name: t.name,
        count: countRow ? parseInt(countRow.count, 10) : 0
      });
    }

    const activeTable = req.query.table || (tables.length > 0 ? tables[0].name : null);
    let columns = [];
    let rows = [];

    if (activeTable) {
      const validTable = tables.find(t => t.name === activeTable);
      if (validTable) {
        if (DB.isPostgres) {
          const colRows = await DB.all(`
            SELECT column_name as name, data_type as type 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = ?
            ORDER BY ordinal_position ASC
          `, activeTable);
          columns = colRows;
          rows = await DB.all(`SELECT * FROM "${activeTable}" ORDER BY 1 DESC LIMIT 100`);
        } else {
          columns = await DB.all(`PRAGMA table_info("${activeTable}")`);
          rows = await DB.all(`SELECT * FROM "${activeTable}" ORDER BY rowid DESC LIMIT 100`);
        }
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
router.post('/admin/database/query', async (req, res) => {
  const { sql } = req.body;
  if (!sql || !sql.trim()) {
    return res.redirect('/admin/database?error=Query+SQL+tidak+boleh+kosong');
  }

  let tables = [];
  try {
    let rawTables = [];
    if (DB.isPostgres) {
      rawTables = await DB.all(`
        SELECT table_name as name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name ASC
      `);
    } else {
      rawTables = await DB.all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name ASC
      `);
    }

    for (const t of rawTables) {
      const countRow = await DB.get(`SELECT COUNT(*) as count FROM "${t.name}"`);
      tables.push({ name: t.name, count: countRow ? parseInt(countRow.count, 10) : 0 });
    }

    const trimmed = sql.trim();
    let queryResult = null;
    let message = '';

    if (trimmed.toUpperCase().startsWith('SELECT') || trimmed.toUpperCase().startsWith('PRAGMA') || trimmed.toUpperCase().startsWith('SHOW')) {
      const rows = await DB.all(trimmed);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      queryResult = { rows, columns };
      message = `Query berhasil dieksekusi: ${rows.length} baris data ditemukan.`;
    } else {
      const info = await DB.run(trimmed);
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
  if (DB.isPostgres) {
    return res.redirect('/admin/database?success=Database+tersimpan+aman+di+Cloud+Supabase.+Pencadangan+dapat+dilakukan+langsung+melalui+Dashboard+Supabase.');
  }

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
router.get('/admin/users', async (req, res) => {
  try {
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

    // Eksekusi query daftar pengguna dan metrik secara paralel (High-Speed Zero-Lag)
    const [users, totalUsersRow, totalPelangganRow, totalAdminsRow] = await Promise.all([
      DB.all(sql, ...params),
      DB.get('SELECT COUNT(*) as count FROM users'),
      DB.get("SELECT COUNT(*) as count FROM users WHERE role = 'pelanggan'"),
      DB.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'")
    ]);

    const totalUsers = totalUsersRow ? parseInt(totalUsersRow.count, 10) : 0;
    const totalPelanggan = totalPelangganRow ? parseInt(totalPelangganRow.count, 10) : 0;
    const totalAdmins = totalAdminsRow ? parseInt(totalAdminsRow.count, 10) : 0;

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
  } catch (err) {
    console.error('Error admin users:', err);
    res.redirect('/admin?error=' + encodeURIComponent(err.message));
  }
});

// 16. Tambah Anggota Baru
router.post('/admin/users', upload.single('avatar_file'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !name.trim() || !email || !email.trim() || !password || !password.trim()) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Nama, email, dan password wajib diisi!'));
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await DB.get('SELECT id FROM users WHERE email = ?', cleanEmail);
    if (existing) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Email sudah digunakan oleh anggota lain!'));
    }

    const cleanRole = (role === 'admin') ? 'admin' : 'pelanggan';
    const cleanName = name.trim();
    let avatarUrl = req.file 
      ? await uploadToStorage(req.file, 'avatars')
      : `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanName)}`;

    await DB.run(
      'INSERT INTO users (name, email, password, role, avatar) VALUES (?, ?, ?, ?, ?)',
      cleanName, cleanEmail, password.trim(), cleanRole, avatarUrl
    );

    res.redirect('/admin/users?success=' + encodeURIComponent(`Anggota "${cleanName}" berhasil ditambahkan.`));
  } catch (err) {
    console.error('Error tambah anggota:', err);
    res.redirect('/admin/users?error=' + encodeURIComponent('Gagal menambah anggota: ' + err.message));
  }
});

// 17. Edit Data Anggota
router.post('/admin/users/:id/edit', upload.single('avatar_file'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { name, email, password, role } = req.body;

    const user = await DB.get('SELECT * FROM users WHERE id = ?', userId);
    if (!user) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Anggota tidak ditemukan.'));
    }

    if (!name || !name.trim() || !email || !email.trim()) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Nama dan email tidak boleh kosong!'));
    }

    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== user.email) {
      const existing = await DB.get('SELECT id FROM users WHERE email = ? AND id != ?', cleanEmail, userId);
      if (existing) {
        return res.redirect('/admin/users?error=' + encodeURIComponent('Email tersebut sudah dipakai akun lain!'));
      }
    }

    const cleanRole = (role === 'admin') ? 'admin' : 'pelanggan';
    const cleanName = name.trim();
    let newAvatar = req.file ? await uploadToStorage(req.file, 'avatars') : user.avatar;

    // Jika password diisi, perbarui password. Jika kosong, pertahankan password lama
    if (password && password.trim().length > 0) {
      await DB.run(
        'UPDATE users SET name = ?, email = ?, password = ?, role = ?, avatar = ? WHERE id = ?',
        cleanName, cleanEmail, password.trim(), cleanRole, newAvatar, userId
      );
    } else {
      await DB.run(
        'UPDATE users SET name = ?, email = ?, role = ?, avatar = ? WHERE id = ?',
        cleanName, cleanEmail, cleanRole, newAvatar, userId
      );
    }

    // Jika user yang diedit adalah akun admin yang sedang login, update sesi aktif
    if (req.session.user && req.session.user.id === userId) {
      req.session.user.name = cleanName;
      req.session.user.email = cleanEmail;
      req.session.user.role = cleanRole;
      req.session.user.avatar = newAvatar;
    }

    res.redirect('/admin/users?success=' + encodeURIComponent(`Data anggota "${cleanName}" berhasil diperbarui.`));
  } catch (err) {
    console.error('Error edit anggota:', err);
    res.redirect('/admin/users?error=' + encodeURIComponent('Gagal memperbarui anggota: ' + err.message));
  }
});

// 18. Hapus Anggota
router.post('/admin/users/:id/delete', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const user = await DB.get('SELECT * FROM users WHERE id = ?', userId);

    if (!user) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Anggota tidak ditemukan.'));
    }

    // Proteksi: Admin tidak boleh menghapus akunnya sendiri
    if (req.session.user && req.session.user.id === userId) {
      return res.redirect('/admin/users?error=' + encodeURIComponent('Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif!'));
    }

    // Hapus data progres pengguna dan kode OTP pengguna terlebih dahulu
    await DB.run('DELETE FROM user_progress WHERE user_id = ?', userId);
    await DB.run('DELETE FROM email_otps WHERE email = ?', user.email);
    await DB.run('DELETE FROM users WHERE id = ?', userId);

    res.redirect('/admin/users?success=' + encodeURIComponent(`Akun anggota "${user.name}" (${user.email}) berhasil dihapus.`));
  } catch (err) {
    console.error('Error hapus anggota:', err);
    res.redirect('/admin/users?error=' + encodeURIComponent('Gagal menghapus anggota: ' + err.message));
  }
});

// ==============================================================
// 5. CRUD PUSAT PENGELOLAAN RESOURCE & AI SKILLS (ADMIN)
// ==============================================================

// A. Daftar Seluruh Resource
router.get('/admin/resources', async (req, res) => {
  try {
    const [resources, totalCountRow, activeCountRow, skillCountRow] = await Promise.all([
      DB.all('SELECT * FROM resources ORDER BY sort_order ASC, id DESC'),
      DB.get('SELECT COUNT(*) as count FROM resources'),
      DB.get('SELECT COUNT(*) as count FROM resources WHERE is_active = 1'),
      DB.get("SELECT COUNT(*) as count FROM resources WHERE category = 'AI Skills'")
    ]);

    const stats = {
      total: totalCountRow ? parseInt(totalCountRow.count, 10) : 0,
      active: activeCountRow ? parseInt(activeCountRow.count, 10) : 0,
      skills: skillCountRow ? parseInt(skillCountRow.count, 10) : 0
    };

    res.render('admin/resources', {
      title: 'Kelola Resource & SKILL.md - Panel Admin Kyzoo',
      pageTitle: 'Kelola Resources',
      currentPath: '/admin/resources',
      resources: resources || [],
      stats,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Error admin resources:', err);
    res.render('admin/resources', {
      title: 'Kelola Resource & SKILL.md - Panel Admin Kyzoo',
      pageTitle: 'Kelola Resources',
      currentPath: '/admin/resources',
      resources: [],
      stats: { total: 0, active: 0, skills: 0 },
      success: null,
      error: 'Terjadi kendala saat memuat resource: ' + err.message
    });
  }
});

// B. Tambah Resource Baru (Simpel & Cepat)
router.post('/admin/resources/create', async (req, res) => {
  try {
    const {
      title, category, platform, description,
      sop_instruction, content_markdown, external_url,
      badge_text, sort_order
    } = req.body;

    if (!title || !title.trim()) {
      return res.redirect('/admin/resources?error=' + encodeURIComponent('Judul resource wajib diisi.'));
    }

    const cleanTitle = title.trim();
    const cleanUrl = (external_url || '').trim();
    const cleanDesc = (description || '').trim();

    // Auto-detect platform dari link / judul jika tidak diisi
    let derivedPlatform = (platform || '').trim();
    if (!derivedPlatform) {
      const urlLower = cleanUrl.toLowerCase();
      const titleLower = cleanTitle.toLowerCase();
      if (urlLower.includes('gemini.google.com') || titleLower.includes('gemini')) {
        derivedPlatform = 'gemini';
      } else if (urlLower.includes('github.com') || titleLower.includes('github')) {
        derivedPlatform = 'github';
      } else if (urlLower.includes('spreadsheets') || titleLower.includes('sheet')) {
        derivedPlatform = 'sheets';
      } else if (urlLower.includes('antigravity') || titleLower.includes('antigravity')) {
        derivedPlatform = 'antigravity';
      } else {
        derivedPlatform = 'general';
      }
    }

    await DB.run(`
      INSERT INTO resources (
        title, category, platform, description,
        sop_instruction, content_markdown, external_url,
        badge_text, sort_order, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `,
      cleanTitle,
      (category || 'AI Skills').trim(),
      derivedPlatform,
      cleanDesc,
      (sop_instruction || cleanDesc || '').trim(),
      (content_markdown || '').trim(),
      cleanUrl,
      (badge_text || 'Khusus Member').trim(),
      parseInt(sort_order, 10) || 1
    );

    res.redirect('/admin/resources?success=' + encodeURIComponent('Resource baru berhasil ditambahkan!'));
  } catch (err) {
    console.error('Error create resource:', err);
    res.redirect('/admin/resources?error=' + encodeURIComponent('Gagal menambah resource: ' + err.message));
  }
});

// C. Perbarui Resource (Edit Simpel)
router.post('/admin/resources/:id/update', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, category, platform, description,
      sop_instruction, content_markdown, external_url,
      badge_text, sort_order, is_active
    } = req.body;

    if (!title || !title.trim()) {
      return res.redirect('/admin/resources?error=' + encodeURIComponent('Judul resource wajib diisi.'));
    }

    const cleanTitle = title.trim();
    const cleanUrl = (external_url || '').trim();
    const cleanDesc = (description || '').trim();

    // Auto-detect platform jika belum ditentukan
    let derivedPlatform = (platform || '').trim();
    if (!derivedPlatform) {
      const urlLower = cleanUrl.toLowerCase();
      const titleLower = cleanTitle.toLowerCase();
      if (urlLower.includes('gemini.google.com') || titleLower.includes('gemini')) {
        derivedPlatform = 'gemini';
      } else if (urlLower.includes('github.com') || titleLower.includes('github')) {
        derivedPlatform = 'github';
      } else if (urlLower.includes('spreadsheets') || titleLower.includes('sheet')) {
        derivedPlatform = 'sheets';
      } else if (urlLower.includes('antigravity') || titleLower.includes('antigravity')) {
        derivedPlatform = 'antigravity';
      } else {
        derivedPlatform = 'general';
      }
    }

    await DB.run(`
      UPDATE resources SET
        title = ?,
        category = ?,
        platform = ?,
        description = ?,
        sop_instruction = COALESCE(NULLIF(?, ''), description),
        content_markdown = COALESCE(?, content_markdown),
        external_url = ?,
        badge_text = COALESCE(NULLIF(?, ''), badge_text),
        sort_order = ?,
        is_active = ?
      WHERE id = ?
    `,
      cleanTitle,
      (category || 'AI Skills').trim(),
      derivedPlatform,
      cleanDesc,
      (sop_instruction || cleanDesc || '').trim(),
      (content_markdown !== undefined) ? content_markdown.trim() : '',
      cleanUrl,
      (badge_text || 'Khusus Member').trim(),
      parseInt(sort_order, 10) || 1,
      (is_active === '1' || is_active === 1) ? 1 : 0,
      id
    );

    res.redirect('/admin/resources?success=' + encodeURIComponent('Resource berhasil diperbarui!'));
  } catch (err) {
    console.error('Error update resource:', err);
    res.redirect('/admin/resources?error=' + encodeURIComponent('Gagal memperbarui resource: ' + err.message));
  }
});

// D. Toggle Visibilitas Resource (Aktif / Sembunyi)
router.post('/admin/resources/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await DB.get('SELECT is_active, title FROM resources WHERE id = ?', id);
    if (!item) {
      return res.redirect('/admin/resources?error=' + encodeURIComponent('Resource tidak ditemukan.'));
    }

    const nextState = item.is_active === 1 ? 0 : 1;
    await DB.run('UPDATE resources SET is_active = ? WHERE id = ?', nextState, id);

    const statusMsg = nextState === 1 ? 'diaktifkan' : 'disembunyikan dari member';
    res.redirect('/admin/resources?success=' + encodeURIComponent(`Resource "${item.title}" berhasil ${statusMsg}.`));
  } catch (err) {
    console.error('Error toggle resource:', err);
    res.redirect('/admin/resources?error=' + encodeURIComponent(err.message));
  }
});

// E. Hapus Resource
router.post('/admin/resources/:id/delete', async (req, res) => {
  try {
    const { id } = req.params;
    const item = await DB.get('SELECT title FROM resources WHERE id = ?', id);
    await DB.run('DELETE FROM resources WHERE id = ?', id);

    const titleStr = item ? item.title : '';
    res.redirect('/admin/resources?success=' + encodeURIComponent(`Resource "${titleStr}" berhasil dihapus permanen.`));
  } catch (err) {
    console.error('Error delete resource:', err);
    res.redirect('/admin/resources?error=' + encodeURIComponent(err.message));
  }
});

module.exports = router;
