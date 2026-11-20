const express = require('express');
const router = express.Router();
const DB = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// Helper Parser Link Video ke Embed Player Responsif
function formatVideoEmbed(source, url) {
  if (!url) return { type: 'none', embedUrl: '' };

  const rawUrl = url.trim();

  // 1. YouTube Handler
  if (source === 'youtube' || rawUrl.includes('youtube.com') || rawUrl.includes('youtu.be')) {
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = rawUrl.match(ytRegex);
    if (match && match[1]) {
      return {
        type: 'iframe',
        embedUrl: `https://www.youtube-nocookie.com/embed/${match[1]}?rel=0&modestbranding=1&playsinline=1`
      };
    }
  }

  // 2. Vimeo Handler
  if (source === 'vimeo' || rawUrl.includes('vimeo.com')) {
    const vimeoRegex = /vimeo\.com\/(?:video\/)?([0-9]+)/;
    const match = rawUrl.match(vimeoRegex);
    if (match && match[1]) {
      return {
        type: 'iframe',
        embedUrl: `https://player.vimeo.com/video/${match[1]}?dnt=1`
      };
    }
  }

  // 3. Google Drive Handler
  if (source === 'drive' || rawUrl.includes('drive.google.com')) {
    const driveRegex = /\/d\/([a-zA-Z0-9_-]+)/;
    const match = rawUrl.match(driveRegex);
    if (match && match[1]) {
      return {
        type: 'iframe',
        embedUrl: `https://drive.google.com/file/d/${match[1]}/preview`
      };
    }
  }

  // 4. File Video Uploaded / Direct MP4 URL
  if (source === 'upload' || rawUrl.endsWith('.mp4') || rawUrl.endsWith('.webm') || rawUrl.startsWith('/uploads/')) {
    return {
      type: 'video',
      embedUrl: rawUrl
    };
  }

  // Fallback
  return {
    type: 'iframe',
    embedUrl: rawUrl
  };
}

// API Pencarian Cepat (Live Search untuk Hero Search Bar & Dropdown)
router.get('/api/search', (req, res) => {
  const q = req.query.q ? req.query.q.trim().toLowerCase() : '';
  if (!q) {
    return res.json({ courses: [], lessons: [] });
  }

  const courses = DB.all(`
    SELECT id, title, slug, category, thumbnail
    FROM courses
    WHERE is_active = 1 AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(category) LIKE ?)
    LIMIT 5
  `, `%${q}%`, `%${q}%`, `%${q}%`);

  const lessons = DB.all(`
    SELECT l.id, l.title, l.duration_minutes, l.video_source, c.slug as course_slug, c.title as course_title
    FROM lessons l
    JOIN chapters ch ON l.chapter_id = ch.id
    JOIN courses c ON ch.course_id = c.id
    WHERE c.is_active = 1 AND (LOWER(l.title) LIKE ? OR LOWER(l.content_text) LIKE ?)
    LIMIT 6
  `, `%${q}%`, `%${q}%`);

  res.json({ courses, lessons });
});

// Katalog Semua Kursus
router.get('/courses', (req, res) => {
  const userId = req.session.user.id;
  const search = req.query.q ? req.query.q.trim().toLowerCase() : '';
  const category = req.query.category ? req.query.category.trim() : '';

  let query = `
    SELECT c.*, 
      (SELECT COUNT(*) FROM chapters ch JOIN lessons l ON l.chapter_id = ch.id WHERE ch.course_id = c.id) as total_lessons,
      (SELECT COUNT(*) FROM chapters ch JOIN lessons l ON l.chapter_id = ch.id JOIN user_progress up ON up.lesson_id = l.id WHERE ch.course_id = c.id AND up.user_id = ? AND up.is_completed = 1) as completed_lessons
    FROM courses c
    WHERE c.is_active = 1
  `;
  const params = [userId];

  if (search) {
    query += ` AND (LOWER(c.title) LIKE ? OR LOWER(c.description) LIKE ? OR LOWER(c.category) LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (category) {
    query += ` AND c.category = ?`;
    params.push(category);
  }

  query += ` ORDER BY c.id ASC`;

  const rawCourses = DB.all(query, ...params);
  const courses = rawCourses.map(c => {
    const total = c.total_lessons || 0;
    const completed = c.completed_lessons || 0;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { ...c, percent };
  });

  const categories = DB.all('SELECT DISTINCT category FROM courses WHERE is_active = 1').map(r => r.category);

  res.render('courses_list', {
    title: 'Katalog Tutorial - Kyzoo LMS',
    user: req.session.user,
    courses,
    categories,
    search,
    currentCategory: category
  });
});

// Halaman Silabus Kursus
router.get('/courses/:slug', (req, res) => {
  const userId = req.session.user.id;
  const course = DB.get('SELECT * FROM courses WHERE slug = ? AND is_active = 1', req.params.slug);
  if (!course) {
    return res.status(404).render('error', {
      title: 'Kursus Tidak Ditemukan',
      message: 'Kursus atau tutorial yang Anda cari tidak tersedia.',
      statusCode: 404
    });
  }

  // Ambil Bab & Lessons
  const chapters = DB.all('SELECT * FROM chapters WHERE course_id = ? ORDER BY sort_order ASC, id ASC', course.id);
  for (const ch of chapters) {
    ch.lessons = DB.all(`
      SELECT l.*, 
        COALESCE((SELECT is_completed FROM user_progress WHERE user_id = ? AND lesson_id = l.id), 0) as is_completed
      FROM lessons l
      WHERE l.chapter_id = ?
      ORDER BY l.sort_order ASC, l.id ASC
    `, userId, ch.id);
  }

  // Ambil lesson pertama untuk tombol mulai belajar
  const firstLesson = DB.get(`
    SELECT l.id FROM chapters ch JOIN lessons l ON l.chapter_id = ch.id
    WHERE ch.course_id = ? ORDER BY ch.sort_order ASC, l.sort_order ASC LIMIT 1
  `, course.id);

  res.render('course_detail', {
    title: `${course.title} - Kyzoo LMS`,
    user: req.session.user,
    course,
    chapters,
    firstLessonId: firstLesson ? firstLesson.id : null
  });
});

// Halaman Pemutar Belajar (Video Tutorial Player & Checklist)
function handleLearnView(req, res) {
  const userId = req.session.user.id;
  const courseSlug = req.params.courseSlug;

  const course = DB.get('SELECT * FROM courses WHERE slug = ? AND is_active = 1', courseSlug);
  if (!course) {
    return res.status(404).render('error', {
      title: 'Tutorial Tidak Ditemukan',
      message: 'Tutorial yang Anda tuju tidak ditemukan.',
      statusCode: 404
    });
  }

  // Ambil semua bab dan lessons untuk sidebar materi
  const chapters = DB.all('SELECT * FROM chapters WHERE course_id = ? ORDER BY sort_order ASC, id ASC', course.id);
  let allLessons = [];

  for (const ch of chapters) {
    ch.lessons = DB.all(`
      SELECT l.*, 
        COALESCE((SELECT is_completed FROM user_progress WHERE user_id = ? AND lesson_id = l.id), 0) as is_completed
      FROM lessons l
      WHERE l.chapter_id = ?
      ORDER BY l.sort_order ASC, l.id ASC
    `, userId, ch.id);
    allLessons.push(...ch.lessons);
  }

  if (allLessons.length === 0) {
    return res.render('error', {
      title: 'Materi Belum Tersedia',
      message: 'Materi untuk kursus ini sedang disiapkan oleh Admin.',
      statusCode: 200
    });
  }

  // Tentukan materi aktif
  let activeLessonId = req.params.lessonId ? parseInt(req.params.lessonId, 10) : null;
  let activeLesson = allLessons.find(l => l.id === activeLessonId);

  if (!activeLesson) {
    // Cari materi pertama yang belum diselesaikan
    activeLesson = allLessons.find(l => !l.is_completed) || allLessons[0];
  }

  // Tentukan previous dan next lesson
  const currentIndex = allLessons.findIndex(l => l.id === activeLesson.id);
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  // Format Video Embed
  const videoPlayerInfo = formatVideoEmbed(activeLesson.video_source, activeLesson.video_url);

  // Hitung persentase progress kursus ini
  const completedCount = allLessons.filter(l => l.is_completed).length;
  const courseProgressPercent = Math.round((completedCount / allLessons.length) * 100);

  res.render('course_view', {
    title: `${activeLesson.title} - ${course.title} - Kyzoo`,
    user: req.session.user,
    course,
    chapters,
    activeLesson,
    videoPlayerInfo,
    prevLesson,
    nextLesson,
    totalLessons: allLessons.length,
    completedCount,
    courseProgressPercent
  });
}

router.get('/learn/:courseSlug', handleLearnView);
router.get('/learn/:courseSlug/:lessonId', handleLearnView);

// API Toggle Tandai Selesai (Checklist Progress AJAX)
router.post('/api/progress/toggle', (req, res) => {
  const userId = req.session.user.id;
  const { lessonId } = req.body;

  if (!lessonId) {
    return res.status(400).json({ error: 'lessonId wajib disertakan' });
  }

  const id = parseInt(lessonId, 10);
  const existing = DB.get('SELECT is_completed FROM user_progress WHERE user_id = ? AND lesson_id = ?', userId, id);

  let newStatus = 1;
  if (existing) {
    newStatus = existing.is_completed === 1 ? 0 : 1;
    DB.run(
      'UPDATE user_progress SET is_completed = ?, completed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND lesson_id = ?',
      newStatus, userId, id
    );
  } else {
    DB.run(
      'INSERT INTO user_progress (user_id, lesson_id, is_completed) VALUES (?, ?, 1)',
      userId, id
    );
    newStatus = 1;
  }

  // Hitung ulang progress kursus terkait
  const lesson = DB.get('SELECT chapter_id FROM lessons WHERE id = ?', id);
  let coursePercent = 0;
  if (lesson) {
    const chapter = DB.get('SELECT course_id FROM chapters WHERE id = ?', lesson.chapter_id);
    if (chapter) {
      const stats = DB.get(`
        SELECT 
          COUNT(l.id) as total,
          COUNT(up.id) as completed
        FROM chapters ch
        JOIN lessons l ON l.chapter_id = ch.id
        LEFT JOIN user_progress up ON up.lesson_id = l.id AND up.user_id = ? AND up.is_completed = 1
        WHERE ch.course_id = ?
      `, userId, chapter.course_id);

      coursePercent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    }
  }

  res.json({
    success: true,
    isCompleted: newStatus === 1,
    coursePercent
  });
});

module.exports = router;
