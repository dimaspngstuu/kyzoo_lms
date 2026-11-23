const express = require('express');
const router = express.Router();
const DB = require('../db');
const mailer = require('../services/mailer');

// Halaman Login
router.get('/login', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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

// 1-Click Demo Login Dinonaktifkan (Keamanan Akun)
router.get('/demo-login/:role', (req, res) => {
  res.redirect('/login');
});

// Proses Login Tradisional
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.render('login', {
        title: 'Masuk - Kyzoo LMS',
        error: 'Harap isi email dan password.',
        success: null
      });
    }

    const user = await DB.get('SELECT * FROM users WHERE email = ?', email.trim().toLowerCase());
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
  } catch (err) {
    console.error('Error login:', err);
    res.render('login', {
      title: 'Masuk - Kyzoo LMS',
      error: 'Terjadi kesalahan sistem: ' + err.message,
      success: null
    });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session = null;
  res.clearCookie('kyzoo_session', { path: '/' });
  res.redirect('/login?success=Anda+berhasil+keluar');
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
    const user = await DB.get('SELECT * FROM users WHERE email = ?', cleanEmail);
    if (!user) {
      return res.redirect('/login?tab=otp&error=' + encodeURIComponent('Email belum terdaftar di Kyzoo LMS. Silakan hubungi Admin untuk aktivasi membership.'));
    }

    // Generate 6 digit angka OTP acak
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // Berlaku 10 menit

    // Nonaktifkan kode OTP lama untuk email ini
    await DB.run('UPDATE email_otps SET is_used = 1 WHERE email = ?', cleanEmail);

    // Simpan kode OTP baru ke database
    await DB.run(
      'INSERT INTO email_otps (email, code, expires_at) VALUES (?, ?, ?)',
      cleanEmail, otpCode, expiresAt
    );

    // Kirim email via Nodemailer (atau simulasi jika belum ada SMTP)
    const sendResult = await mailer.sendOtpEmail(cleanEmail, otpCode);

    if (sendResult.mode === 'smtp') {
      res.redirect(`/verify-otp?email=${encodeURIComponent(cleanEmail)}&sent=true`);
    } else {
      // Mode simulasi lokal
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
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp_code } = req.body;
    if (!email || !otp_code) {
      return res.redirect(`/verify-otp?email=${encodeURIComponent(email || '')}&error=` + encodeURIComponent('Email dan kode OTP wajib diisi.'));
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = otp_code.trim().replace(/\s+/g, '');

    // Cari kode OTP aktif di basis data
    const record = await DB.get(
      'SELECT * FROM email_otps WHERE email = ? AND code = ? AND is_used = 0 ORDER BY id DESC LIMIT 1',
      cleanEmail, cleanCode
    );

    if (!record) {
      return res.redirect(`/verify-otp?email=${encodeURIComponent(cleanEmail)}&error=` + encodeURIComponent('Kode OTP salah atau sudah tidak berlaku.'));
    }

    // Cek kedaluwarsa waktu
    if (Date.now() > Number(record.expires_at)) {
      return res.redirect(`/verify-otp?email=${encodeURIComponent(cleanEmail)}&error=` + encodeURIComponent('Kode OTP telah kedaluwarsa. Silakan minta kode baru.'));
    }

    // Tandai OTP telah digunakan
    await DB.run('UPDATE email_otps SET is_used = 1 WHERE id = ?', record.id);

    // Ambil data user dan set session login
    const user = await DB.get('SELECT * FROM users WHERE email = ?', cleanEmail);
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

// Register Akun Baru (Ditutup untuk Umum - Pendaftaran Eksklusif Member oleh Admin)
router.get('/register', (req, res) => {
  res.redirect('/login?error=' + encodeURIComponent('Pendaftaran publik ditutup. Akun member didaftarkan langsung secara eksklusif oleh Admin.'));
});

router.post('/register', (req, res) => {
  res.redirect('/login?error=' + encodeURIComponent('Pendaftaran publik ditutup. Akun member didaftarkan langsung secara eksklusif oleh Admin.'));
});

module.exports = router;
