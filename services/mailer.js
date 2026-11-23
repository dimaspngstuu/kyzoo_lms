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
async function sendOtpEmail(toEmail, otpCode) {
  const isConfigured = isSmtpConfigured();

  // Deteksi lokasi berkas logo Kyzoo resmi (Gambar 2)
  const logoCandidates = [
    path.join(__dirname, '../public/images/logo-k.jpg'),
    path.join(process.cwd(), 'public/images/logo-k.jpg'),
    path.join(__dirname, '../public/images/email-logo.jpg'),
    path.join(process.cwd(), 'public/images/email-logo.jpg')
  ];
  let logoPath = null;
  for (const candidate of logoCandidates) {
    if (fs.existsSync(candidate)) {
      logoPath = candidate;
      break;
    }
  }

  // Gunakan CID inline attachment agar gambar 100% tampil tajam tanpa terblokir di Gmail
  const logoSrc = logoPath 
    ? 'cid:kyzoo_logo' 
    : 'https://raw.githubusercontent.com/dimaspngstuu/kyzoo_lms/main/public/images/logo-k.jpg';

  // Template Email HTML Berdesain Modern ala Kyzoo
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
        .card { max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 24px; padding: 40px 32px; border: 1px solid #e2e8f0; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
        .logo { text-align: center; margin-bottom: 24px; }
        .title { font-size: 20px; font-weight: 800; text-align: center; color: #0f172a; margin-bottom: 8px; }
        .subtitle { font-size: 13px; text-align: center; color: #64748b; margin-bottom: 28px; }
        .otp-box { background: #f5f3ff; border: 2px dashed #8b5cf6; border-radius: 16px; padding: 20px; text-align: center; margin-bottom: 24px; }
        .otp-code { font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #6c5dd3; font-family: monospace; }
        .info { font-size: 12px; color: #64748b; line-height: 1.6; text-align: center; margin-bottom: 24px; }
        .footer { font-size: 11px; text-align: center; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 18px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo" style="text-align: center; margin-bottom: 24px;">
          <!-- Logo Resmi Kyzoo (Anti-Pecah & Tampil Sempurna di Gmail) -->
          <table align="center" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 12px auto;">
            <tr>
              <td align="center" style="background: #ffffff; border-radius: 22px; padding: 6px; border: 1px solid #f1f5f9; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
                <img src="${logoSrc}" width="76" height="76" alt="Kyzoo" style="display: block; border-radius: 18px; object-fit: contain;" />
              </td>
            </tr>
          </table>
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 8px; letter-spacing: -0.4px;">
            Kyzoo LMS
          </div>
          <p style="margin: 3px 0 0 0; font-size: 11px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;">Learning Management System</p>
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

      const attachments = [];
      if (logoPath) {
        attachments.push({
          filename: 'kyzoo-logo.jpg',
          path: logoPath,
          cid: 'kyzoo_logo'
        });
      }

      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || `"Kyzoo LMS" <${process.env.SMTP_USER}>`,
        to: toEmail,
        subject: `[Kyzoo LMS] Kode Verifikasi Masuk Anda: ${otpCode}`,
        text: `Kode verifikasi masuk Kyzoo LMS Anda adalah: ${otpCode}. Kode ini berlaku selama 10 menit.`,
        html: htmlContent,
        attachments: attachments
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
