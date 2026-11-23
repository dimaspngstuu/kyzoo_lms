const express = require('express');
const router = express.Router();
const DB = require('../db');
const { requireAuth } = require('../middleware/auth');
const { formatLessonContent } = require('../helpers/contentFormatter');

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
        provider: 'youtube',
        videoId: match[1],
        embedUrl: `https://www.youtube-nocookie.com/embed/${match[1]}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1`
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
  if (source === 'upload' || rawUrl.endsWith('.mp4') || rawUrl.endsWith('.webm') || rawUrl.startsWith('/uploads/') || rawUrl.includes('supabase.co/storage')) {
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
router.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q ? req.query.q.trim().toLowerCase() : '';
    if (!q) {
      return res.json({ courses: [], lessons: [] });
    }

    const courses = await DB.all(`
      SELECT id, title, slug, category, thumbnail
      FROM courses
      WHERE is_active = 1 AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(category) LIKE ?)
      LIMIT 5
    `, `%${q}%`, `%${q}%`, `%${q}%`);

    const lessons = await DB.all(`
      SELECT l.id, l.title, l.duration_minutes, l.video_source, c.slug as course_slug, c.title as course_title
      FROM lessons l
      JOIN chapters ch ON l.chapter_id = ch.id
      JOIN courses c ON ch.course_id = c.id
      WHERE c.is_active = 1 AND (LOWER(l.title) LIKE ? OR LOWER(l.content_text) LIKE ?)
      LIMIT 6
    `, `%${q}%`, `%${q}%`);

    res.json({ courses, lessons });
  } catch (err) {
    console.error('Error search API:', err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint Sinkronisasi Otomatis Durasi Video (YouTube & File Lokal)
router.post('/api/lessons/:id/sync-duration', async (req, res) => {
  try {
    const lessonId = req.params.id;
    const durationMinutes = parseInt(req.body.duration_minutes, 10);
    if (!durationMinutes || durationMinutes <= 0) {
      return res.status(400).json({ success: false, message: 'Durasi menit tidak valid' });
    }

    const lesson = await DB.get('SELECT id, duration_minutes FROM lessons WHERE id = ?', lessonId);
    if (!lesson) {
      return res.status(404).json({ success: false, message: 'Materi tidak ditemukan' });
    }

    // Hanya update basis data jika durasi berbeda
    if (lesson.duration_minutes !== durationMinutes) {
      await DB.run('UPDATE lessons SET duration_minutes = ? WHERE id = ?', durationMinutes, lessonId);
      console.log(`[Auto-Sync] Durasi lesson ID ${lessonId} otomatis diperbarui dari ${lesson.duration_minutes}m ke ${durationMinutes}m`);
    }

    res.json({ success: true, lessonId, duration_minutes: durationMinutes });
  } catch (err) {
    console.error('Error sync duration:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Katalog Semua Kursus
router.get('/courses', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const search = req.query.q ? req.query.q.trim().toLowerCase() : '';
    const category = req.query.category ? req.query.category.trim() : '';

    let query = `
      SELECT c.*, 
        (SELECT COUNT(*) FROM chapters ch JOIN lessons l ON l.chapter_id = ch.id WHERE ch.course_id = c.id) as total_lessons,
        (SELECT COUNT(*) FROM chapters ch JOIN lessons l ON l.chapter_id = ch.id JOIN user_progress up ON up.lesson_id = l.id WHERE ch.course_id = c.id AND up.user_id = ? AND up.is_completed = 1) as completed_lessons
      FROM courses c
      WHERE (c.is_active = 1 OR c.is_active IS NULL)
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

    const rawCourses = await DB.all(query, ...params);
    const courses = rawCourses.map(c => {
      const total = parseInt(c.total_lessons, 10) || 0;
      const completed = parseInt(c.completed_lessons, 10) || 0;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
      return { ...c, percent };
    });

    const rawCategories = await DB.all('SELECT DISTINCT category FROM courses WHERE (is_active = 1 OR is_active IS NULL)');
    const categories = rawCategories.map(r => r.category);

    res.render('courses_list', {
      title: 'Katalog Tutorial - Kyzoo LMS',
      user: req.session.user,
      courses,
      categories,
      search,
      currentCategory: category
    });
  } catch (err) {
    console.error('Error courses:', err);
    res.status(500).render('error', {
      title: 'Kesalahan Sistem',
      message: 'Gagal memuat katalog tutorial: ' + err.message,
      statusCode: 500
    });
  }
});

// Halaman Silabus Kursus (Berbasis Daftar Episode Tunggal / Linear)
router.get('/courses/:slug', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const course = await DB.get('SELECT * FROM courses WHERE slug = ? AND (is_active = 1 OR is_active IS NULL)', req.params.slug);
    if (!course) {
      return res.status(404).render('error', {
        title: 'Kursus Tidak Ditemukan',
        message: 'Kursus atau tutorial yang Anda cari tidak tersedia.',
        statusCode: 404
      });
    }

    // Ambil semua lessons langsung secara linear urut per episode
    const allLessons = await DB.all(`
      SELECT l.*, ch.title as chapter_title,
        COALESCE((SELECT is_completed FROM user_progress WHERE user_id = ? AND lesson_id = l.id), 0) as is_completed
      FROM lessons l
      JOIN chapters ch ON l.chapter_id = ch.id
      WHERE ch.course_id = ?
      ORDER BY ch.sort_order ASC, l.sort_order ASC, l.id ASC
    `, userId, course.id);

    // Ambil lesson pertama yang belum selesai (atau yang pertama)
    const nextLesson = allLessons.find(l => !Number(l.is_completed)) || allLessons[0];
    const completedCount = allLessons.filter(l => Number(l.is_completed) === 1).length;
    const courseProgressPercent = allLessons.length > 0 ? Math.round((completedCount / allLessons.length) * 100) : 0;

    res.render('course_detail', {
      title: `${course.title} - Kyzoo LMS`,
      user: req.session.user,
      course,
      lessons: allLessons,
      firstLessonId: nextLesson ? nextLesson.id : null,
      completedCount,
      courseProgressPercent
    });
  } catch (err) {
    console.error('Error course detail:', err);
    res.status(500).render('error', {
      title: 'Kesalahan Sistem',
      message: 'Gagal memuat silabus kursus: ' + err.message,
      statusCode: 500
    });
  }
});

// Halaman Pemutar Belajar (Video Tutorial Player & Checklist)
async function handleLearnView(req, res) {
  try {
    const userId = req.session.user.id;
    const courseSlug = req.params.courseSlug;

    const course = await DB.get('SELECT * FROM courses WHERE slug = ? AND (is_active = 1 OR is_active IS NULL)', courseSlug);
    if (!course) {
      return res.status(404).render('error', {
        title: 'Tutorial Tidak Ditemukan',
        message: 'Tutorial yang Anda tuju tidak ditemukan.',
        statusCode: 404
      });
    }

    // Ambil seluruh episode lessons untuk kursus ini dalam 1 query optimal (High Performance)
    const allLessons = await DB.all(`
      SELECT l.*, ch.title as chapter_title,
        COALESCE((SELECT is_completed FROM user_progress WHERE user_id = ? AND lesson_id = l.id), 0) as is_completed
      FROM lessons l
      JOIN chapters ch ON l.chapter_id = ch.id
      WHERE ch.course_id = ?
      ORDER BY ch.sort_order ASC, l.sort_order ASC, l.id ASC
    `, userId, course.id);

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
      activeLesson = allLessons.find(l => !Number(l.is_completed)) || allLessons[0];
    }

    // Tentukan previous dan next lesson serta indeks episode
    const currentIndex = allLessons.findIndex(l => l.id === activeLesson.id);
    const currentEpisodeIndex = currentIndex >= 0 ? currentIndex : 0;
    const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
    const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

    // Format Video Embed
    const videoPlayerInfo = formatVideoEmbed(activeLesson.video_source, activeLesson.video_url);

    // Hitung persentase progress kursus ini
    const completedCount = allLessons.filter(l => Number(l.is_completed) === 1).length;
    const courseProgressPercent = Math.round((completedCount / allLessons.length) * 100);

    res.render('course_view', {
      title: `EP ${currentEpisodeIndex + 1}: ${activeLesson.title} - ${course.title} - Kyzoo`,
      user: req.session.user,
      course,
      lessons: allLessons,
      currentEpisodeIndex,
      activeLesson,
      videoPlayerInfo,
      prevLesson,
      nextLesson,
      totalLessons: allLessons.length,
      completedCount,
      courseProgressPercent,
      renderedContent: formatLessonContent(activeLesson.content_text)
    });
  } catch (err) {
    console.error('Error learn view:', err);
    res.status(500).render('error', {
      title: 'Kesalahan Sistem',
      message: 'Gagal memuat ruang belajar: ' + err.message,
      statusCode: 500
    });
  }
}

router.get('/learn/:courseSlug', handleLearnView);
router.get('/learn/:courseSlug/:lessonId', handleLearnView);

// API Toggle Tandai Selesai (Checklist Progress AJAX)
router.post('/api/progress/toggle', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { lessonId } = req.body;

    if (!lessonId) {
      return res.status(400).json({ error: 'lessonId wajib disertakan' });
    }

    const id = parseInt(lessonId, 10);
    const existing = await DB.get('SELECT is_completed FROM user_progress WHERE user_id = ? AND lesson_id = ?', userId, id);

    let newStatus = 1;
    if (existing) {
      newStatus = Number(existing.is_completed) === 1 ? 0 : 1;
      await DB.run(
        'UPDATE user_progress SET is_completed = ?, completed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND lesson_id = ?',
        newStatus, userId, id
      );
    } else {
      await DB.run(
        'INSERT INTO user_progress (user_id, lesson_id, is_completed) VALUES (?, ?, 1)',
        userId, id
      );
      newStatus = 1;
    }

    // Hitung ulang progress kursus terkait
    const lesson = await DB.get('SELECT chapter_id FROM lessons WHERE id = ?', id);
    let coursePercent = 0;
    if (lesson) {
      const chapter = await DB.get('SELECT course_id FROM chapters WHERE id = ?', lesson.chapter_id);
      if (chapter) {
        const stats = await DB.get(`
          SELECT 
            COUNT(l.id) as total,
            COUNT(up.id) as completed
          FROM chapters ch
          JOIN lessons l ON l.chapter_id = ch.id
          LEFT JOIN user_progress up ON up.lesson_id = l.id AND up.user_id = ? AND up.is_completed = 1
          WHERE ch.course_id = ?
        `, userId, chapter.course_id);

        const total = parseInt(stats.total, 10) || 0;
        const completed = parseInt(stats.completed, 10) || 0;
        coursePercent = total > 0 ? Math.round((completed / total) * 100) : 0;
      }
    }

    res.json({
      success: true,
      isCompleted: newStatus === 1,
      coursePercent
    });
  } catch (err) {
    console.error('Error toggle progress:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
