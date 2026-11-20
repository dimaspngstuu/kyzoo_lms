const express = require('express');
const router = express.Router();
const DB = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

// Dashboard Utama (Layout Persis Gambar Quyl)
router.get('/dashboard', (req, res) => {
  const userId = req.session.user.id;

  // 1. Hitung Metrik Statistik Pengguna
  const totalLessonsRow = DB.get('SELECT COUNT(*) as count FROM lessons');
  const totalLessons = totalLessonsRow ? totalLessonsRow.count : 0;

  const completedLessonsRow = DB.get(
    'SELECT COUNT(*) as count FROM user_progress WHERE user_id = ? AND is_completed = 1',
    userId
  );
  const completedLessons = completedLessonsRow ? completedLessonsRow.count : 0;

  const totalChaptersRow = DB.get('SELECT COUNT(*) as count FROM chapters');
  const totalChapters = totalChaptersRow ? totalChaptersRow.count : 0;

  const totalCoursesRow = DB.get('SELECT COUNT(*) as count FROM courses WHERE is_active = 1');
  const totalCourses = totalCoursesRow ? totalCoursesRow.count : 0;

  // Persentase Progres Keseluruhan
  const overallPercentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  // 2. Ambil Semua Kursus dengan Hitungan Progres Pengguna
  const rawCourses = DB.all(`
    SELECT c.*, 
      (SELECT COUNT(*) FROM chapters ch JOIN lessons l ON l.chapter_id = ch.id WHERE ch.course_id = c.id) as total_lessons,
      (SELECT COUNT(*) FROM chapters ch JOIN lessons l ON l.chapter_id = ch.id JOIN user_progress up ON up.lesson_id = l.id WHERE ch.course_id = c.id AND up.user_id = ? AND up.is_completed = 1) as completed_lessons
    FROM courses c
    WHERE c.is_active = 1
    ORDER BY c.id ASC
  `, userId);

  const courses = rawCourses.map((c, index) => {
    const total = c.total_lessons || 0;
    const completed = c.completed_lessons || 0;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    // Warna tema gradasi bar progres untuk kartu daftar (ala Quyl)
    const colorThemes = ['#6c5dd3', '#ff754c', '#ffa2c0', '#3f8cff'];
    const barColor = colorThemes[index % colorThemes.length];

    return {
      ...c,
      percent,
      barColor,
      isFinished: total > 0 && completed >= total
    };
  });

  // Pisahkan tab Active & Completed
  const activeCourses = courses.filter(c => !c.isFinished);
  const completedCourses = courses.filter(c => c.isFinished);

  // 3. Modul Lanjut Belajar (Resume Banner di bagian atas)
  // Ambil kursus pertama yang belum selesai, atau kursus pertama
  const resumeCourse = activeCourses.length > 0 ? activeCourses[0] : (courses[0] || null);
  let nextLesson = null;
  if (resumeCourse) {
    nextLesson = DB.get(`
      SELECT l.*, ch.course_id
      FROM chapters ch
      JOIN lessons l ON l.chapter_id = ch.id
      WHERE ch.course_id = ? AND l.id NOT IN (
        SELECT lesson_id FROM user_progress WHERE user_id = ? AND is_completed = 1
      )
      ORDER BY ch.sort_order ASC, l.sort_order ASC
      LIMIT 1
    `, resumeCourse.id, userId);

    if (!nextLesson) {
      // Jika semua sudah selesai, ambil lesson pertama
      nextLesson = DB.get(`
        SELECT l.*, ch.course_id
        FROM chapters ch
        JOIN lessons l ON l.chapter_id = ch.id
        WHERE ch.course_id = ?
        ORDER BY ch.sort_order ASC, l.sort_order ASC
        LIMIT 1
      `, resumeCourse.id);
    }
  }

  // 4. Jadwal Rekomendasi Belajar (Upcoming ala Quyl)
  const upcomingList = [
    {
      dateDay: '29',
      dateMonth: 'Nov',
      title: 'Practical Theory : Desain Layout',
      tag: 'Assignments',
      tagColor: 'text-[#ff754c] bg-[#FFF4EE]'
    },
    {
      dateDay: '01',
      dateMonth: 'Des',
      title: 'Komponen Navbar & Grid',
      tag: 'Tutorial',
      tagColor: 'text-[#6c5dd3] bg-[#F2F0FD]'
    },
    {
      dateDay: '03',
      dateMonth: 'Des',
      title: 'Evaluasi Modul Belajar',
      tag: 'Review',
      tagColor: 'text-[#4CAF50] bg-[#EEFAF3]'
    }
  ];

  res.render('dashboard', {
    title: 'Dashboard - Kyzoo LMS',
    user: req.session.user,
    stats: {
      totalLessons,
      completedLessons,
      totalChapters,
      totalCourses,
      overallPercentage
    },
    courses,
    activeCourses,
    completedCourses,
    resumeCourse,
    nextLesson,
    upcomingList
  });
});

// Halaman Bantuan / Help
router.get('/help', (req, res) => {
  res.render('help', {
    title: 'Pusat Bantuan - Kyzoo LMS',
    user: req.session.user
  });
});

// Halaman Pengaturan / Settings
router.get('/settings', (req, res) => {
  res.render('settings', {
    title: 'Pengaturan Akun - Kyzoo LMS',
    user: req.session.user,
    message: null
  });
});

module.exports = router;
