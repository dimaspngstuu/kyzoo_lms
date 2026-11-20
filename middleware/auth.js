const DB = require('../db');

module.exports = {
  requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }
    next();
  },

  requireAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }
    if (req.session.user.role !== 'admin') {
      return res.status(403).render('error', {
        title: 'Akses Ditolak',
        message: 'Halaman ini khusus untuk Admin Pengelola. Pelanggan hanya memiliki hak akses membaca dan menonton materi.',
        statusCode: 403
      });
    }
    next();
  },

  setUserLocals(req, res, next) {
    res.locals.currentUser = req.session ? req.session.user || null : null;
    res.locals.currentPath = req.path;

    // Ambil pohon kursus & bab turunan untuk menu hierarki sidebar
    try {
      const courses = DB.all(`
        SELECT id, title, slug, code 
        FROM courses 
        WHERE is_active = 1 
        ORDER BY id ASC
      `);

      res.locals.sidebarCourses = courses.map(c => {
        const chapters = DB.all(`
          SELECT id, title, sort_order,
            (SELECT COUNT(1) FROM lessons l WHERE l.chapter_id = chapters.id) as lesson_count
          FROM chapters 
          WHERE course_id = ? 
          ORDER BY sort_order ASC, id ASC
        `, c.id);
        return { ...c, chapters };
      });
    } catch (e) {
      res.locals.sidebarCourses = [];
    }

    next();
  }
};
