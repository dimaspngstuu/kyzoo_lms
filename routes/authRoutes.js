const express = require('express');
const router = express.Router();
const DB = require('../db');
const mailer = require('../services/mailer');

// Halaman Login
router.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', {
    title: 'Masuk - Kyzoo LMS',
    tab: req.query.tab || 'password',
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

// ==============================================================
// FITUR MASUK DENGAN KODE OTP EMAIL
// ==============================================================

// 1. Minta Kirim Kode OTP ke Email Terdaftar
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.redirect('/login?tab=otp&error=' + encodeURIComponent('Alamat email wajib diisi.'));
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = DB.get('SELECT * FROM users WHERE email = ?', cleanEmail);
    if (!user) {
      return res.redirect('/login?tab=otp&error=' + encodeURIComponent('Email belum terdaftar di Kyzoo LMS. Silakan buat akun terlebih dahulu.'));
    }

    // Generate 6 digit angka OTP acak
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // Berlaku 10 menit

    // Nonaktifkan kode OTP lama untuk email ini
    DB.run('UPDATE email_otps SET is_used = 1 WHERE email = ?', cleanEmail);

    // Simpan kode OTP baru ke database
    DB.run(
      'INSERT INTO email_otps (email, code, expires_at) VALUES (?, ?, ?)',
      cleanEmail, otpCode, expiresAt
    );

    // Kirim email via Nodemailer (atau simulasi jika belum ada SMTP)
    const sendResult = await mailer.sendOtpEmail(cleanEmail, otpCode);

    if (sendResult.mode === 'smtp') {
      res.redirect(`/verify-otp?email=${encodeURIComponent(cleanEmail)}&sent=true`);
    } else {
      // Mode simulasi lokal (langsung sertakan kode untuk kemudahan uji coba cepat)
      res.redirect(`/verify-otp?email=${encodeURIComponent(cleanEmail)}&simulated=${otpCode}`);
    }
  } catch (err) {
    console.error('Error send-otp:', err);
    res.redirect('/login?tab=otp&error=' + encodeURIComponent('Gagal memproses pengiriman OTP: ' + err.message));
  }
});

// 2. Halaman Masukkan Kode OTP
router.get('/verify-otp', (req, res) => {
  const { email, simulated, sent, error } = req.query;
  if (!email) {
    return res.redirect('/login');
  }

  res.render('verify_otp', {
    title: 'Verifikasi Kode OTP - Kyzoo LMS',
    email: email.trim(),
    simulated: simulated || null,
    sent: sent === 'true',
    error: error || null,
    isSmtpConfigured: mailer.isSmtpConfigured()
  });
});

// 3. Proses Verifikasi Kode OTP & Auto Login
router.post('/verify-otp', (req, res) => {
  try {
    const { email, otp_code } = req.body;
    if (!email || !otp_code) {
      return res.redirect(`/verify-otp?email=${encodeURIComponent(email || '')}&error=` + encodeURIComponent('Email dan kode OTP wajib diisi.'));
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = otp_code.trim().replace(/\s+/g, '');

    // Cari kode OTP aktif di basis data
    const record = DB.get(
      'SELECT * FROM email_otps WHERE email = ? AND code = ? AND is_used = 0 ORDER BY id DESC LIMIT 1',
      cleanEmail, cleanCode
    );

    if (!record) {
      return res.redirect(`/verify-otp?email=${encodeURIComponent(cleanEmail)}&error=` + encodeURIComponent('Kode OTP salah atau sudah tidak berlaku.'));
    }

    // Cek kedaluwarsa waktu
    if (Date.now() > record.expires_at) {
      return res.redirect(`/verify-otp?email=${encodeURIComponent(cleanEmail)}&error=` + encodeURIComponent('Kode OTP telah kedaluwarsa. Silakan minta kode baru.'));
    }

    // Tandai OTP telah digunakan
    DB.run('UPDATE email_otps SET is_used = 1 WHERE id = ?', record.id);

    // Ambil data user dan set session login
    const user = DB.get('SELECT * FROM users WHERE email = ?', cleanEmail);
    if (!user) {
      return res.redirect('/login?error=' + encodeURIComponent('Pengguna tidak ditemukan.'));
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar
    };

    console.log(`[Auth] Pengguna ${user.email} (${user.role}) berhasil masuk menggunakan kode OTP.`);
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Error verify-otp:', err);
    res.redirect(`/verify-otp?email=${encodeURIComponent(req.body.email || '')}&error=` + encodeURIComponent('Terjadi kesalahan verifikasi: ' + err.message));
  }
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
