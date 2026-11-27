// Batas waktu inaktivitas sesi: 30 Menit (1.800.000 ms)
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

function checkSessionInactivity(req, res) {
  if (!req.session || !req.session.user) return false;

  const now = Date.now();
  if (req.session.lastActivity && (now - Number(req.session.lastActivity) > INACTIVITY_TIMEOUT_MS)) {
    req.session = null;
    res.clearCookie('kyzoo_session', { path: '/' });
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.redirect('/login?reason=inactivity&error=' + encodeURIComponent('Sesi Anda telah berakhir otomatis karena tidak ada pergerakan/aktivitas selama 30 menit. Silakan masuk kembali.'));
    return true; // Sesi telah kedaluwarsa
  }

  // Perbarui stempel waktu aktivitas terakhir pada sesi server
  req.session.lastActivity = now;
  return false;
}

module.exports = {
  requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.redirect('/login');
    }
    if (checkSessionInactivity(req, res)) return;
    next();
  },

  requireAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.redirect('/login');
    }
    if (checkSessionInactivity(req, res)) return;
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
    if (req.session && req.session.user) {
      const now = Date.now();
      if (req.session.lastActivity && (now - Number(req.session.lastActivity) > INACTIVITY_TIMEOUT_MS)) {
        req.session = null;
        res.clearCookie('kyzoo_session', { path: '/' });
        res.locals.currentUser = null;
      } else {
        res.locals.currentUser = req.session.user;
      }
    } else {
      res.locals.currentUser = null;
    }
    res.locals.currentPath = req.path;
    next();
  }
};
