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
    next();
  }
};
