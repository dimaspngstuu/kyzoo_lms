process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

let cachedTransporter = null;

// Deteksi apakah kredensial SMTP telah dikonfigurasi di Environment
function isSmtpConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Buat transporter jika kredensial SMTP tersedia (dengan Connection Pooling & Keep-Alive)
function getTransporter() {
  if (!isSmtpConfigured()) return null;
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const isGmail = host.includes('gmail.com');

  const config = isGmail
    ? {
      service: 'gmail',
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    }
    : {
      host: host,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    };

  cachedTransporter = nodemailer.createTransport(config);
  return cachedTransporter;
}

// Fungsi Utama: Mengirimkan Kode OTP ke Email Terdaftar (Tanpa Berkas Lampiran Gambar)
async function sendOtpEmail(toEmail, otpCode) {
  const isConfigured = isSmtpConfigured();

  // Template Email HTML Berdesain Modern & Ringan (Murni Tipografi, Tanpa Lampiran File)
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
        .card { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 24px; padding: 36px 28px; border: 1px solid #e2e8f0; box-shadow: 0 4px 20px rgba(0,0,0,0.04); }
        .logo { text-align: center; margin-bottom: 24px; }
        .title { font-size: 20px; font-weight: 800; text-align: center; color: #0f172a; margin-bottom: 8px; }
        .subtitle { font-size: 13px; text-align: center; color: #64748b; margin-bottom: 24px; line-height: 1.5; }
        .otp-box { background: #f5f3ff; border: 2px dashed #8b5cf6; border-radius: 16px; padding: 18px; text-align: center; margin-bottom: 24px; }
        .otp-code { font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #6c5dd3; font-family: monospace; }
        .info { font-size: 12px; color: #64748b; line-height: 1.6; text-align: center; margin-bottom: 24px; }
        .footer { font-size: 11px; text-align: center; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 18px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">
          <div style="display: inline-block; padding: 6px 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 999px; margin-bottom: 8px;">
            <span style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 18px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px;">
              kyzoo<span style="color: #6c5dd3;">+</span>
            </span>
          </div>
          <div style="font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">
            Learning Management System
          </div>
        </div>

        <div class="title">Kode Verifikasi Masuk</div>
        <div class="subtitle">Gunakan kode 6-digit berikut untuk masuk ke akun Kyzoo LMS Anda:</div>
        
        <div class="otp-box">
          <div class="otp-code">${otpCode}</div>
        </div>

        <div class="info">
          ⏱️ Kode ini hanya berlaku selama <strong>10 menit</strong>.<br>
          🔒 Jangan berikan kode ini kepada siapa pun demi keamanan akun Anda.
        </div>

        <div class="footer">
          Email ini dikirim otomatis oleh sistem Kyzoo LMS.<br>
          Jika Anda tidak merasa meminta kode ini, silakan abaikan pesan ini.
        </div>
      </div>
    </body>
    </html>
  `;

  if (isConfigured) {
    try {
      const transporter = getTransporter();

      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || `"Kyzoo LMS" <${process.env.SMTP_USER}>`,
        to: toEmail,
        subject: `[Kyzoo LMS] Kode Verifikasi Masuk Anda: ${otpCode}`,
        text: `Kode verifikasi masuk Kyzoo LMS Anda adalah: ${otpCode}. Kode ini berlaku selama 10 menit.`,
        html: htmlContent
      });

      console.log(`[SMTP] Email OTP berhasil terkirim ke ${toEmail} (MessageId: ${info.messageId})`);
      return { success: true, mode: 'smtp', email: toEmail };
    } catch (err) {
      console.error('[SMTP Error] Gagal mengirim email via SMTP:', err);
      // Fallback ke simulasi jika pengiriman SMTP gagal
      return { success: true, mode: 'simulated_fallback', code: otpCode, email: toEmail, error: err.message };
    }
  } else {
    // Mode Simulasi Lokal / Uji Coba Cepat (Saat SMTP belum dikonfigurasi)
    console.log('\n======================================================');
    console.log('📬 [SIMULASI EMAIL OTP KYZOO]');
    console.log(`Kepada    : ${toEmail}`);
    console.log(`Kode OTP  : ${otpCode}`);
    console.log('Masa Aktif: 10 Menit');
    console.log('======================================================\n');

    return { success: true, mode: 'simulated', code: otpCode, email: toEmail };
  }
}

module.exports = {
  sendOtpEmail,
  isSmtpConfigured
};
