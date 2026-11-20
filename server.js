const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const DB = require('./db');
const { setUserLocals } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup Direktori Public & Uploads
const publicDir = path.join(__dirname, 'public');
const uploadVideosDir = path.join(__dirname, 'public/uploads/videos');
const uploadThumbnailsDir = path.join(__dirname, 'public/uploads/thumbnails');
if (!fs.existsSync(uploadVideosDir)) fs.mkdirSync(uploadVideosDir, { recursive: true });
if (!fs.existsSync(uploadThumbnailsDir)) fs.mkdirSync(uploadThumbnailsDir, { recursive: true });

// Setup View Engine (EJS)
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Body Parser & Static Assets
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

// Express Session
app.use(session({
  secret: 'kyzoo-lms-secure-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 hari
  }
}));

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
      const noLayoutViews = ['login', 'register', 'error'];
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
