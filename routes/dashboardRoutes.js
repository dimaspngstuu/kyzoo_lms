const express = require('express');
const router = express.Router();
const multer = require('multer');
const DB = require('../db');
const { requireAuth } = require('../middleware/auth');
const { uploadToStorage } = require('../services/storage');

// Konfigurasi Multer Memory Storage (Kompatibel Serverless Vercel & Supabase Storage)
const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // Maksimal 8MB
  fileFilter: function (req, file, cb) {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const extname = allowed.test((file.originalname || '').toLowerCase());
    const mimetype = allowed.test(file.mimetype);
    if (extname || mimetype) {
      return cb(null, true);
    }
    cb(new Error('Format file tidak didukung. Harap pilih gambar JPG, PNG, WEBP, atau GIF.'));
  }
});

router.use(requireAuth);

// Dashboard Utama (Layout Persis Gambar Quyl + Hero Greeting Gambar 2)
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.session.user.id;

    // Sinkronisasi data profil terbaru dari basis data
    const freshUser = await DB.get('SELECT * FROM users WHERE id = ?', userId);
    if (freshUser) {
      req.session.user = {
        id: freshUser.id,
        name: freshUser.name,
        email: freshUser.email,
        role: freshUser.role,
        avatar: freshUser.avatar
      };
      res.locals.currentUser = req.session.user;
    }

    // Hitung Ucapan Waktu Dinamis (Pagi / Siang / Sore / Malam)
    const hour = new Date().getHours();
    let greeting = 'Selamat Pagi';
    if (hour >= 11 && hour < 15) {
      greeting = 'Selamat Siang';
    } else if (hour >= 15 && hour < 18) {
      greeting = 'Selamat Sore';
    } else if (hour >= 18 || hour < 4) {
      greeting = 'Selamat Malam';
    }

    // 1. Hitung Metrik Statistik Pengguna secara Paralel (High Performance)
    const [totalLessonsRow, completedLessonsRow, totalChaptersRow, totalCoursesRow] = await Promise.all([
      DB.get('SELECT COUNT(*) as count FROM lessons'),
      DB.get('SELECT COUNT(*) as count FROM user_progress WHERE user_id = ? AND is_completed = 1', userId),
      DB.get('SELECT COUNT(*) as count FROM chapters'),
      DB.get('SELECT COUNT(*) as count FROM courses WHERE is_active = 1')
    ]);

    const totalLessons = totalLessonsRow ? parseInt(totalLessonsRow.count, 10) : 0;
    const completedLessons = completedLessonsRow ? parseInt(completedLessonsRow.count, 10) : 0;
    const totalChapters = totalChaptersRow ? parseInt(totalChaptersRow.count, 10) : 0;
    const totalCourses = totalCoursesRow ? parseInt(totalCoursesRow.count, 10) : 0;

    // Persentase Progres Keseluruhan
    const overallPercentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    // 2. Ambil Semua Kursus dengan Hitungan Progres Pengguna (Optimized Batch Loading - Zero Lag)
    const [rawCourses, allChapters, allLessons] = await Promise.all([
      DB.all(`
        SELECT c.*, 
          (SELECT COUNT(*) FROM chapters ch JOIN lessons l ON l.chapter_id = ch.id WHERE ch.course_id = c.id) as total_lessons,
          (SELECT COUNT(*) FROM chapters ch JOIN lessons l ON l.chapter_id = ch.id JOIN user_progress up ON up.lesson_id = l.id WHERE ch.course_id = c.id AND up.user_id = ? AND up.is_completed = 1) as completed_lessons
        FROM courses c
        WHERE c.is_active = 1
        ORDER BY c.id ASC
      `, userId),

      DB.all(`
        SELECT ch.*,
          (SELECT COUNT(1) FROM lessons l WHERE l.chapter_id = ch.id) as lesson_count
        FROM chapters ch
        JOIN courses c ON c.id = ch.course_id
        WHERE c.is_active = 1
        ORDER BY ch.sort_order ASC, ch.id ASC
      `),

      DB.all(`
        SELECT l.*,
          COALESCE((SELECT is_completed FROM user_progress WHERE user_id = ? AND lesson_id = l.id), 0) as is_completed
        FROM lessons l
        JOIN chapters ch ON ch.id = l.chapter_id
        JOIN courses c ON c.id = ch.course_id
        WHERE c.is_active = 1
        ORDER BY l.sort_order ASC, l.id ASC
      `, userId)
    ]);

    // Pemetaan Hash Map di Memori (O(N) Complexity, Anti N+1 Query)
    const lessonsByChapter = {};
    for (const l of allLessons) {
      if (!lessonsByChapter[l.chapter_id]) lessonsByChapter[l.chapter_id] = [];
      lessonsByChapter[l.chapter_id].push(l);
    }

    const chaptersByCourse = {};
    for (const ch of allChapters) {
      ch.lessons = lessonsByChapter[ch.id] || [];
      if (!chaptersByCourse[ch.course_id]) chaptersByCourse[ch.course_id] = [];
      chaptersByCourse[ch.course_id].push(ch);
    }

    const colorThemes = ['#6c5dd3', '#ff754c', '#ffa2c0', '#3f8cff'];
    const courses = rawCourses.map((c, index) => {
      const total = parseInt(c.total_lessons, 10) || 0;
      const completed = parseInt(c.completed_lessons, 10) || 0;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
      const barColor = colorThemes[index % colorThemes.length];
      const chapters = chaptersByCourse[c.id] || [];

      return {
        ...c,
        percent,
        barColor,
        isFinished: total > 0 && completed >= total,
        chapters
      };
    });

    // Pisahkan tab Active & Completed
    const activeCourses = courses.filter(c => !c.isFinished);
    const completedCourses = courses.filter(c => c.isFinished);

    // 3. Modul Lanjut Belajar (Resume Banner di bagian atas)
    const resumeCourse = activeCourses.length > 0 ? activeCourses[0] : (courses[0] || null);
    let nextLesson = null;
    if (resumeCourse) {
      nextLesson = await DB.get(`
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
        nextLesson = await DB.get(`
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
      greeting,
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
  } catch (err) {
    console.error('Error dashboard:', err);
    res.status(500).render('error', {
      title: 'Kesalahan Dashboard',
      message: 'Gagal memuat data dashboard: ' + err.message,
      statusCode: 500
    });
  }
});

// Halaman Bantuan / Help
router.get('/help', (req, res) => {
  res.render('help', {
    title: 'Pusat Bantuan - Kyzoo LMS',
    user: req.session.user
  });
});

// Halaman Pengaturan / Settings
router.get('/settings', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const freshUser = await DB.get('SELECT * FROM users WHERE id = ?', userId);
    const user = freshUser || req.session.user;

    res.render('settings', {
      title: 'Pengaturan Akun - Kyzoo LMS',
      user,
      success: req.query.success || null,
      error: req.query.error || null
    });
  } catch (err) {
    console.error('Error settings:', err);
    res.redirect('/dashboard?error=' + encodeURIComponent(err.message));
  }
});

// Update Password Akun Pengguna
router.post('/settings/password', async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.redirect('/settings?error=' + encodeURIComponent('Semua kolom kata sandi wajib diisi.'));
    }

    if (newPassword.length < 6) {
      return res.redirect('/settings?error=' + encodeURIComponent('Kata sandi baru minimal harus 6 karakter.'));
    }

    if (newPassword !== confirmPassword) {
      return res.redirect('/settings?error=' + encodeURIComponent('Konfirmasi kata sandi baru tidak cocok.'));
    }

    const user = await DB.get('SELECT * FROM users WHERE id = ?', userId);
    if (!user || user.password !== currentPassword.trim()) {
      return res.redirect('/settings?error=' + encodeURIComponent('Kata sandi saat ini tidak tepat.'));
    }

    if (currentPassword.trim() === newPassword.trim()) {
      return res.redirect('/settings?error=' + encodeURIComponent('Kata sandi baru tidak boleh sama dengan kata sandi lama.'));
    }

    // Update password baru di database
    await DB.run('UPDATE users SET password = ? WHERE id = ?', newPassword.trim(), userId);

    return res.redirect('/settings?success=' + encodeURIComponent('Kata sandi berhasil diperbarui! Silakan gunakan kata sandi baru Anda.'));
  } catch (err) {
    console.error('Error update password:', err);
    res.redirect('/settings?error=' + encodeURIComponent(err.message));
  }
});

// Ganti & Upload Foto Profil Pengguna (Member & Admin)
router.post('/settings/avatar', (req, res) => {
  uploadAvatar.single('avatar_file')(req, res, async function (err) {
    try {
      if (err) {
        return res.redirect('/settings?error=' + encodeURIComponent(err.message || 'Gagal mengunggah foto profil.'));
      }
      if (!req.file) {
        return res.redirect('/settings?error=' + encodeURIComponent('Silakan pilih berkas foto terlebih dahulu.'));
      }

      const userId = req.session.user.id;
      const avatarUrl = await uploadToStorage(req.file, 'avatars');

      await DB.run('UPDATE users SET avatar = ? WHERE id = ?', avatarUrl, userId);

      if (req.session.user) {
        req.session.user.avatar = avatarUrl;
      }

      return res.redirect('/settings?success=' + encodeURIComponent('Foto profil berhasil diperbarui!'));
    } catch (uploadErr) {
      console.error('Error upload avatar:', uploadErr);
      res.redirect('/settings?error=' + encodeURIComponent('Gagal menyimpan foto profil: ' + uploadErr.message));
    }
  });
});

// ==============================================================
// KYZOO SKILL & RESOURCE HUB (MEMBER ACCESS)
// ==============================================================
router.get('/hub', async (req, res) => {
  try {
    const rawResources = await DB.all(
      'SELECT * FROM resources WHERE is_active = 1 ORDER BY sort_order ASC, id DESC'
    );
    const resources = rawResources || [];

    // Kategori Unik untuk Tab Filter
    const rawCategories = Array.from(new Set(resources.map(r => r.category).filter(Boolean)));
    const categories = ['Semua', ...rawCategories];

    res.render('hub', {
      title: 'Skill & Resource Hub - Kyzoo LMS',
      pageTitle: 'Skill & Resource Hub',
      currentPath: '/hub',
      resources,
      categories,
      selectedCategory: req.query.category || 'Semua'
    });
  } catch (err) {
    console.error('Error fetching hub resources:', err);
    res.render('hub', {
      title: 'Skill & Resource Hub - Kyzoo LMS',
      pageTitle: 'Skill & Resource Hub',
      currentPath: '/hub',
      resources: [],
      categories: ['Semua'],
      selectedCategory: 'Semua',
      error: 'Terjadi kendala saat memuat resource: ' + err.message
    });
  }
});

module.exports = router;
