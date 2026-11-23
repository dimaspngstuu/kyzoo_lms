require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const compression = require('compression');
const cookieSession = require('cookie-session');
const path = require('path');
const fs = require('fs');
const DB = require('./db');
const { setUserLocals } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Performance: Disable X-Powered-By & Enable Gzip Compression
app.disable('x-powered-by');
app.use(compression());

// Setup Direktori Public & Uploads (Hanya jika filesystem writeable)
const publicDir = path.join(__dirname, 'public');
try {
  const uploadVideosDir = path.join(__dirname, 'public/uploads/videos');
  const uploadThumbnailsDir = path.join(__dirname, 'public/uploads/thumbnails');
  const uploadAvatarsDir = path.join(__dirname, 'public/uploads/avatars');
  if (!fs.existsSync(uploadVideosDir)) fs.mkdirSync(uploadVideosDir, { recursive: true });
  if (!fs.existsSync(uploadThumbnailsDir)) fs.mkdirSync(uploadThumbnailsDir, { recursive: true });
  if (!fs.existsSync(uploadAvatarsDir)) fs.mkdirSync(uploadAvatarsDir, { recursive: true });
} catch (e) {
  // Ignored on read-only environments like Vercel Serverless
}

// Setup View Engine (EJS)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Body Parser & Static Assets (dengan browser HTTP caching untuk kecepatan maksimal)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir, {
  maxAge: '30d',
  immutable: true,
  etag: true
}));

// Cookie Session (Serverless-Friendly untuk Vercel & Multi-Instance)
app.use(cookieSession({
  name: 'kyzoo_session',
  keys: [process.env.SESSION_SECRET || 'kyzoo-lms-secure-key-2026'],
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 hari
  httpOnly: true,
  sameSite: 'lax'
}));

// Mencegah Vercel CDN atau browser proxy menyimpan cache halaman akun pribadi
app.use((req, res, next) => {
  if (!req.path.startsWith('/uploads') && !req.path.includes('.')) {
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Polyfill req.session.destroy untuk kompatibilitas cookie-session
app.use((req, res, next) => {
  if (req.session && !req.session.destroy) {
    req.session.destroy = function (cb) {
      req.session = null;
      if (typeof cb === 'function') cb();
    };
  }
  next();
});

// Set User Locals Middleware (untuk akses session user di EJS)
app.use(setUserLocals);

// Custom EJS Layout Middleware (Menangani `<%- body %>` pada views/layout.ejs secara otomatis)
app.use((req, res, next) => {
  const origRender = res.render.bind(res);
  res.render = function (view, options = {}, callback) {
    origRender(view, options, (err, html) => {
      if (err) {
        if (callback) return callback(err);
        return next(err);
      }

      // Halaman tanpa layout utama
      const noLayoutViews = ['login', 'register', 'verify_otp', 'error'];
      if (options.layout === false || noLayoutViews.includes(view)) {
        if (callback) return callback(null, html);
        return res.send(html);
      }

      // Inject hasil view ke dalam layout.ejs
      const layoutOptions = { ...res.locals, ...options, body: html };
      return origRender('layout', layoutOptions, callback);
    });
  };
  next();
});

// Import Routes
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const courseRoutes = require('./routes/courseRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Root Route Redirect
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  return res.redirect('/login');
});

// Mount Routes
app.use(authRoutes);
app.use(dashboardRoutes);
app.use(courseRoutes);
app.use(adminRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Halaman Tidak Ditemukan',
    message: 'Maaf, halaman yang Anda tuju tidak ditemukan pada sistem Kyzoo LMS.',
    statusCode: 404
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).render('error', {
    title: 'Terjadi Kesalahan Server',
    message: err.message || 'Terjadi gangguan internal pada server.',
    statusCode: 500
  });
});

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Kyzoo LMS Server Berjalan Normal!`);
    console.log(`🌐 URL Sistem : http://localhost:${PORT}`);
    console.log(`👑 Demo Admin : admin@kyzoo.com / admin123`);
    console.log(`🎓 Demo User  : user@kyzoo.com / user123`);
    console.log(`====================================================`);
  });
}

module.exports = app;
