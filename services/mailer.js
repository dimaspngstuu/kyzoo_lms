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

// Fungsi Utama: Mengirimkan Kode OTP ke Email Terdaftar
// Tampilan 100% presisi sesuai desain resmi Kyzoo, tanpa lampiran berkas (bebas chip [kyzoo-logo.jpg] di Gmail)
async function sendOtpEmail(toEmail, otpCode) {
  const isConfigured = isSmtpConfigured();

  // URL gambar logo resmi Kyzoo (di-host via CDN publik HTTPS agar tampil tanpa menjadi file lampiran di Gmail)
  const logoUrl = 'https://raw.githubusercontent.com/dimaspngstuu/kyzoo_lms/master/public/images/logo-k.jpg';

  // Template Email HTML Berdesain Modern Presisi Sesuai Mockup Kyzoo
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Kode Verifikasi Masuk</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px; color: #1e293b; }
        .card { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 28px; padding: 38px 28px; border: 1px solid #e2e8f0; box-shadow: 0 4px 20px rgba(0,0,0,0.04); text-align: center; }
        .logo-wrap { margin-bottom: 24px; text-align: center; }
        .title { font-size: 21px; font-weight: 800; text-align: center; color: #0f172a; margin-bottom: 8px; }
        .subtitle { font-size: 13.5px; text-align: center; color: #64748b; margin-bottom: 26px; line-height: 1.5; }
        .otp-box { background: #f5f3ff; border: 2px dashed #8b5cf6; border-radius: 16px; padding: 20px 16px; text-align: center; margin: 0 auto 24px auto; }
        .otp-code { font-size: 34px; font-weight: 900; letter-spacing: 10px; color: #6c5dd3; font-family: 'Courier New', Courier, monospace; margin-left: 10px; }
        .info { font-size: 12.5px; color: #64748b; line-height: 1.8; text-align: center; margin-bottom: 24px; }
        .divider { border-top: 1px solid #f1f5f9; margin: 24px 0 20px 0; }
        .footer { font-size: 11.5px; text-align: center; color: #94a3b8; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="card">
        <!-- Logo Resmi Kyzoo (Squircle Box Card) -->
        <div class="logo-wrap">
          <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 14px auto;">
            <tr>
              <td align="center" style="width: 78px; height: 78px; background: #ffffff; border-radius: 22px; border: 1px solid #f1f5f9; box-shadow: 0 4px 16px rgba(0,0,0,0.05); text-align: center; vertical-align: middle;">
                <img src="${logoUrl}" width="54" height="54" alt="Kyzoo" style="display: block; margin: 0 auto; border-radius: 14px; object-fit: contain;" />
              </td>
            </tr>
          </table>
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 8px; letter-spacing: -0.4px;">
            Kyzoo LMS
          </div>
          <p style="margin: 3px 0 0 0; font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px;">LEARNING MANAGEMENT SYSTEM</p>
        </div>

        <div class="title">Kode Verifikasi Masuk</div>
        <div class="subtitle">Gunakan kode verifikasi berikut untuk masuk ke akun Kyzoo LMS Anda:</div>
        
        <div class="otp-box">
          <div class="otp-code">${otpCode}</div>
        </div>

        <div class="info">
          ⏱️ Kode ini hanya berlaku selama <strong>10 menit</strong>.<br>
          🔒 Jangan berikan kode ini kepada siapa pun demi keamanan akun Anda.
        </div>

        <div class="divider"></div>

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
