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

// 7. Kelola Bab & Pelajaran (Kurikulum Kursus)
router.get('/admin/courses/:id/curriculum', (req, res) => {
  const course = DB.get('SELECT * FROM courses WHERE id = ?', req.params.id);
  if (!course) return res.redirect('/admin?error=Kursus+tidak+ditemukan');

  const chapters = DB.all('SELECT * FROM chapters WHERE course_id = ? ORDER BY sort_order ASC, id ASC', course.id);
  for (const ch of chapters) {
    ch.lessons = DB.all('SELECT * FROM lessons WHERE chapter_id = ? ORDER BY sort_order ASC, id ASC', ch.id);
  }

  res.render('admin/curriculum', {
    title: `Kurikulum: ${course.title} - Kyzoo Admin`,
    user: req.session.user,
    course,
    chapters,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

// 8. Tambah Bab Baru
router.post('/admin/courses/:id/chapters/new', (req, res) => {
  const { title } = req.body;
  if (!title) return res.redirect(`/admin/courses/${req.params.id}/curriculum?error=Judul+bab+wajib+diisi`);

  const lastOrder = DB.get('SELECT MAX(sort_order) as max_order FROM chapters WHERE course_id = ?', req.params.id);
  const nextOrder = (lastOrder && lastOrder.max_order) ? lastOrder.max_order + 1 : 1;

  DB.run(
    'INSERT INTO chapters (course_id, title, sort_order) VALUES (?, ?, ?)',
    req.params.id, title.trim(), nextOrder
  );

  res.redirect(`/admin/courses/${req.params.id}/curriculum?success=Bab+berhasil+ditambahkan!`);
});

// 9. Hapus Bab
router.post('/admin/chapters/:id/delete', (req, res) => {
  const chapter = DB.get('SELECT course_id FROM chapters WHERE id = ?', req.params.id);
  if (chapter) {
    DB.run('DELETE FROM chapters WHERE id = ?', req.params.id);
    return res.redirect(`/admin/courses/${chapter.course_id}/curriculum?success=Bab+berhasil+dihapus`);
  }
  res.redirect('/admin');
});

// 10. Tambah Lesson / Materi Video & Teks Baru
router.post('/admin/chapters/:chapterId/lessons/new', upload.single('video_file'), (req, res) => {
  const chapter = DB.get('SELECT * FROM chapters WHERE id = ?', req.params.chapterId);
  if (!chapter) return res.redirect('/admin?error=Bab+tidak+ditemukan');

  const { title, video_source, video_url, content_text, duration_minutes } = req.body;
  if (!title) {
    return res.redirect(`/admin/courses/${chapter.course_id}/curriculum?error=Judul+materi+wajib+diisi`);
  }

  let finalVideoUrl = video_url ? video_url.trim() : '';
  let finalSource = video_source || 'youtube';

  if (req.file) {
    finalSource = 'upload';
    finalVideoUrl = `/uploads/videos/${req.file.filename}`;
  }

  const lastOrder = DB.get('SELECT MAX(sort_order) as max_order FROM lessons WHERE chapter_id = ?', chapter.id);
  const nextOrder = (lastOrder && lastOrder.max_order) ? lastOrder.max_order + 1 : 1;

  DB.run(`
    INSERT INTO lessons (chapter_id, title, video_source, video_url, content_text, duration_minutes, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, chapter.id, title.trim(), finalSource, finalVideoUrl, content_text ? content_text.trim() : '', parseInt(duration_minutes, 10) || 10, nextOrder);

  res.redirect(`/admin/courses/${chapter.course_id}/curriculum?success=Materi+video+berhasil+ditambahkan!`);
});

// 11. Hapus Lesson
router.post('/admin/lessons/:id/delete', (req, res) => {
  const lesson = DB.get('SELECT l.*, ch.course_id FROM lessons l JOIN chapters ch ON l.chapter_id = ch.id WHERE l.id = ?', req.params.id);
  if (lesson) {
    DB.run('DELETE FROM lessons WHERE id = ?', req.params.id);
    return res.redirect(`/admin/courses/${lesson.course_id}/curriculum?success=Materi+berhasil+dihapus`);
  }
  res.redirect('/admin');
});

module.exports = router;
