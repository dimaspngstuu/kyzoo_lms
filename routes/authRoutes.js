const express = require('express');
const router = express.Router();
const DB = require('../db');

// Halaman Login
router.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', {
    title: 'Masuk - Kyzoo LMS',
    error: req.query.error || null,
    success: req.query.success || null
  });
});

// 1-Click Demo Login (Admin atau Pelanggan)
router.get('/demo-login/:role', (req, res) => {
  const role = req.params.role === 'admin' ? 'admin' : 'pelanggan';
  let user = null;
  if (role === 'admin') {
    user = DB.get('SELECT * FROM users WHERE role = ? AND email = ?', 'admin', 'admin@kyzoo.com');
  } else {
    user = DB.get('SELECT * FROM users WHERE role = ? ORDER BY id ASC LIMIT 1', 'pelanggan');
  }
  if (user) {
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar
    };
    return res.redirect('/dashboard');
  }
  res.redirect('/login?error=Akun+demo+tidak+ditemukan');
});

// Proses Login Tradisional
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.render('login', {
      title: 'Masuk - Kyzoo LMS',
      error: 'Harap isi email dan password.',
      success: null
    });
  }

  const user = DB.get('SELECT * FROM users WHERE email = ?', email.trim().toLowerCase());
  if (!user || user.password !== password.trim()) {
    return res.render('login', {
      title: 'Masuk - Kyzoo LMS',
      error: 'Email atau password salah. Silakan coba kembali atau gunakan tombol Demo.',
      success: null
    });
  }

  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar
  };
  res.redirect('/dashboard');
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login?success=Anda+berhasil+keluar');
  });
});

// Register Pelanggan Baru
router.get('/register', (req, res) => {
  res.render('register', {
    title: 'Daftar Akun Pelanggan - Kyzoo LMS',
    error: null
  });
});

router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.render('register', {
      title: 'Daftar Akun Pelanggan - Kyzoo LMS',
      error: 'Semua kolom wajib diisi!'
    });
  }

  const existing = DB.get('SELECT id FROM users WHERE email = ?', email.trim().toLowerCase());
  if (existing) {
    return res.render('register', {
      title: 'Daftar Akun Pelanggan - Kyzoo LMS',
      error: 'Email sudah terdaftar, silakan gunakan email lain atau langsung login.'
    });
  }

  const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;
  DB.run(
    'INSERT INTO users (name, email, password, role, avatar) VALUES (?, ?, ?, ?, ?)',
    name.trim(), email.trim().toLowerCase(), password.trim(), 'pelanggan', defaultAvatar
  );

  res.redirect('/login?success=Pendaftaran+berhasil!+Silakan+masuk+menggunakan+akun+baru+Anda.');
});

module.exports = router;
