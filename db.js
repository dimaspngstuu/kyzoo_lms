require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

let pool = null;
let sqliteDb = null;

// Helper: Ambil URL Database dari variabel Vercel maupun manual
function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || null;
}

// Helper: Konversi penanda parameter SQLite '?' ke format PostgreSQL '$1, $2, $3...'
function toPgSql(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

// Inisialisasi Pool PostgreSQL (Lazy-safe untuk Serverless Vercel)
function getPgPool() {
  if (!pool) {
    let databaseUrl = getDatabaseUrl();
    if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
      try {
        let cleanUrl = databaseUrl;
        try {
          const parsed = new URL(databaseUrl);
          parsed.searchParams.delete('sslmode');
          cleanUrl = parsed.toString();
        } catch (e) {
          cleanUrl = databaseUrl.replace(/([?&])sslmode=[^&]*(&|$)/g, '$1').replace(/[?&]$/, '');
        }

        pool = new Pool({
          connectionString: cleanUrl,
          ssl: {
            rejectUnauthorized: false
          },
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
          keepAlive: true,
          keepAliveInitialDelayMillis: 10000
        });
        console.log('[DB] Mode Aktif: Terhubung ke Supabase PostgreSQL Cloud Database.');
        ensurePgTables(pool).catch(() => {});
      } catch (err) {
        console.error('[DB] Gagal menginisialisasi PostgreSQL Pool:', err.message);
      }
    }
  }
  return pool;
}

let pgTablesEnsured = false;
async function ensurePgTables(p) {
  if (pgTablesEnsured || !p) return;
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS public.resources (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'AI Skills',
        platform TEXT DEFAULT 'antigravity',
        description TEXT,
        sop_instruction TEXT,
        content_markdown TEXT,
        external_url TEXT,
        badge_text TEXT DEFAULT 'Khusus Member',
        sort_order INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_resources_category ON public.resources(category);
      CREATE INDEX IF NOT EXISTS idx_resources_active ON public.resources(is_active);
      CREATE INDEX IF NOT EXISTS idx_resources_sort ON public.resources(sort_order);

      -- Kolom Lampiran Gambar / PPT / Dokumen pada tabel lessons (Opsional)
      ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS attachment_url TEXT;
      ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS attachment_name TEXT;
      ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS attachment_type TEXT;

      -- Pembersihan otomatis nama berkas mentah Gemini_Generated pada tabel lessons
      UPDATE public.lessons 
      SET attachment_name = 'Infografis & Diagram Materi' 
      WHERE attachment_name ILIKE '%gemini_generated%' OR attachment_name ILIKE '%.jpg' OR attachment_name ILIKE '%.png';

      -- Pastikan seluruh kursus aktif secara default dan tampil di katalog siswa
      UPDATE public.courses SET is_active = 1 WHERE is_active = 0 OR is_active IS NULL;
    `);
    pgTablesEnsured = true;

    const resCount = await p.query('SELECT COUNT(*) as count FROM public.resources');
    if (resCount.rows[0] && parseInt(resCount.rows[0].count, 10) === 0) {
      await p.query(`
        INSERT INTO public.resources (title, category, platform, description, sop_instruction, content_markdown, external_url, badge_text, sort_order)
        VALUES 
          (
            'Kyzoo Architect & System Designer SKILL.md',
            'AI Skills',
            'antigravity',
            'Skill AI resmi Kyzoo untuk Google Antigravity IDE. Otomatisasi perancangan arsitektur sistem, PRD generator, dan standardisasi clean code.',
            '1. Buat folder baru di proyek Anda: .gemini/skills/arsitek/\n2. Buat file SKILL.md di dalam folder tersebut.\n3. Salin dan tempel seluruh isi kode SKILL.md ke file tersebut.\n4. Buka obrolan Antigravity IDE dan ketik /arsitek untuk mengaktifkan persona.',
            '---\nname: arsitek\ndescription: Universal Product Architect, Lead Engineering Mentor & PRD Generator by Kyzoo.\n---\n\n# KYZOO SYSTEM ARCHITECT (ARSITEK)\nAnda adalah Arsitek Perangkat Lunak Senior dan Mentor Rekayasa Produk Resmi Kyzoo.\n\n## Aturan Utama:\n1. Selalu utamakan Zero-Lag, Clean Code, dan Kesederhanaan Arsitektur.\n2. Berikan instruksi langkah demi langkah yang jelas dan terstruktur dalam Bahasa Indonesia.\n3. Jangan merusak atau menghapus fitur yang sudah berjalan stabil.',
            'https://github.com/dimaspngstuu/kyzoo_lms',
            '✦ Official Skill',
            1
          ),
          (
            'Kyzoo Assistant System Instructions for Gemini Web',
            'AI Skills',
            'gemini',
            'Formula prompt sistem instruksi khusus Gemini Web & Claude untuk mengubah AI menjadi Senior Fullstack Mentor pribadi.',
            '1. Buka situs Gemini Web (gemini.google.com)\n2. Buka Pengaturan (Settings) > System Instructions atau Custom Instructions.\n3. Tempel seluruh formula prompt yang telah Anda salin.\n4. Simpan dan mulai sesi obrolan baru.',
            'Bertindaklah sebagai Senior Fullstack Architect dan Mentor Pemrograman Kyzoo.\nBantu saya memecahkan masalah koding, desain antarmuka, dan optimasi database dengan pola pikir clean code, efisiensi tinggi, dan penjelasan santun berbahasa Indonesia.',
            'https://gemini.google.com',
            '⚡ AI Prompt',
            2
          ),
          (
            'Kyzoo Design System & UI Kit Starter',
            'Starter Code',
            'github',
            'Template repositori komponen Tailwind CSS, kartu dashboard interaktif, sistem tema dinamis, dan modal popup siap pakai.',
            '1. Kunjungi repositori GitHub resmi.\n2. Lakukan Clone atau Download ZIP ke komputer Anda.\n3. Buka di VS Code atau Antigravity IDE dan jalankan npm install.',
            '// Starter Code Kyzoo UI Kit\n// Komponen Tailwind CSS siap pakai untuk project aplikasi web modern.',
            'https://github.com/dimaspngstuu/kyzoo_lms',
            '🎨 UI Kit',
            3
          ),
          (
            'Google Sheets Otomasi Database Member & Billing',
            'Google Sheets',
            'sheets',
            'Template Google Spreadsheet resmi untuk pembukuan membership, log aktivasi OTP, dan rekap metrik pelanggan.',
            '1. Buka tautan Google Sheets berikut.\n2. Klik menu File > Buat Salinan (Make a Copy) ke Google Drive Anda sendiri.\n3. Sesuaikan kolom nama member dan status membership Anda.',
            'Template Google Sheets resmi untuk manajemen membership dan operasional Kyzoo LMS.',
            'https://docs.google.com/spreadsheets',
            '📊 Spreadsheet',
            4
          );
      `);
    }
  } catch (err) {
    // Abaikan jika tabel sudah ada
  }
}

// Inisialisasi awal saat boot
getPgPool();

// Inisialisasi SQLite lokal hanya jika BUKAN di Vercel dan TIDAK ada URL PostgreSQL
if (!getDatabaseUrl() && !process.env.VERCEL) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'kyzoo.db');
    sqliteDb = new DatabaseSync(dbPath);

    sqliteDb.exec('PRAGMA journal_mode = WAL;');
    sqliteDb.exec('PRAGMA foreign_keys = ON;');

    initSqliteSchema(sqliteDb);
    console.log('[DB] Mode Fallback: Menggunakan basis data lokal SQLite (kyzoo.db).');
  } catch (sqliteErr) {
    console.warn('[DB] SQLite tidak aktif:', sqliteErr.message);
  }
}

function initSqliteSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'pelanggan',
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      thumbnail TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      sort_order INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      video_source TEXT NOT NULL DEFAULT 'youtube',
      video_url TEXT,
      content_text TEXT,
      duration_minutes INTEGER DEFAULT 10,
      attachment_url TEXT,
      attachment_name TEXT,
      attachment_type TEXT,
      sort_order INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      is_completed INTEGER DEFAULT 1,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, lesson_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_otps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      is_used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'AI Skills',
      platform TEXT DEFAULT 'antigravity',
      description TEXT,
      sop_instruction TEXT,
      content_markdown TEXT,
      external_url TEXT,
      badge_text TEXT DEFAULT 'Khusus Member',
      sort_order INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrasi kolom attachment untuk SQLite (jika database sudah ada sebelumnya)
  try { db.prepare("ALTER TABLE lessons ADD COLUMN attachment_url TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE lessons ADD COLUMN attachment_name TEXT").run(); } catch (e) {}
  try { db.prepare("ALTER TABLE lessons ADD COLUMN attachment_type TEXT").run(); } catch (e) {}
  try {
    db.prepare(`UPDATE lessons SET attachment_name = 'Infografis & Diagram Materi' WHERE attachment_name LIKE '%gemini_generated%' OR attachment_name LIKE '%Gemini_Generated%' OR attachment_name LIKE '%.jpg' OR attachment_name LIKE '%.png'`).run();
  } catch (e) {}
  try {
    db.prepare(`UPDATE courses SET is_active = 1 WHERE is_active = 0 OR is_active IS NULL`).run();
  } catch (e) {}

  // Seed default resources jika kosong
  try {
    const resCount = db.prepare('SELECT COUNT(*) as count FROM resources').get();
    if (resCount && resCount.count === 0) {
      const stmt = db.prepare(`
        INSERT INTO resources (title, category, platform, description, sop_instruction, content_markdown, external_url, badge_text, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        'Kyzoo Architect & System Designer SKILL.md',
        'AI Skills',
        'antigravity',
        'Skill AI resmi Kyzoo untuk Google Antigravity IDE. Otomatisasi perancangan arsitektur sistem, PRD generator, dan standardisasi clean code.',
        '1. Buat folder baru di proyek Anda: .gemini/skills/arsitek/\n2. Buat file SKILL.md di dalam folder tersebut.\n3. Salin dan tempel seluruh isi kode SKILL.md ke file tersebut.\n4. Buka obrolan Antigravity IDE dan ketik /arsitek untuk mengaktifkan persona.',
        '---\nname: arsitek\ndescription: Universal Product Architect, Lead Engineering Mentor & PRD Generator by Kyzoo.\n---\n\n# KYZOO SYSTEM ARCHITECT (ARSITEK)\nAnda adalah Arsitek Perangkat Lunak Senior dan Mentor Rekayasa Produk Resmi Kyzoo.\n\n## Aturan Utama:\n1. Selalu utamakan Zero-Lag, Clean Code, dan Kesederhanaan Arsitektur.\n2. Berikan instruksi langkah demi langkah yang jelas dan terstruktur dalam Bahasa Indonesia.\n3. Jangan merusak atau menghapus fitur yang sudah berjalan stabil.',
        'https://github.com/dimaspngstuu/kyzoo_lms',
        '✦ Official Skill',
        1
      );
      stmt.run(
        'Kyzoo Assistant System Instructions for Gemini Web',
        'AI Skills',
        'gemini',
        'Formula prompt sistem instruksi khusus Gemini Web & Claude untuk mengubah AI menjadi Senior Fullstack Mentor pribadi.',
        '1. Buka situs Gemini Web (gemini.google.com)\n2. Buka Pengaturan (Settings) > System Instructions atau Custom Instructions.\n3. Tempel seluruh formula prompt yang telah Anda salin.\n4. Simpan dan mulai sesi obrolan baru.',
        'Bertindaklah sebagai Senior Fullstack Architect dan Mentor Pemrograman Kyzoo.\nBantu saya memecahkan masalah koding, desain antarmuka, dan optimasi database dengan pola pikir clean code, efisiensi tinggi, dan penjelasan santun berbahasa Indonesia.',
        'https://gemini.google.com',
        '⚡ AI Prompt',
        2
      );
      stmt.run(
        'Kyzoo Design System & UI Kit Starter',
        'Starter Code',
        'github',
        'Template repositori komponen Tailwind CSS, kartu dashboard interaktif, sistem tema dinamis, dan modal popup siap pakai.',
        '1. Kunjungi repositori GitHub resmi.\n2. Lakukan Clone atau Download ZIP ke komputer Anda.\n3. Buka di VS Code atau Antigravity IDE dan jalankan npm install.',
        '// Starter Code Kyzoo UI Kit\n// Komponen Tailwind CSS siap pakai untuk project aplikasi web modern.',
        'https://github.com/dimaspngstuu/kyzoo_lms',
        '🎨 UI Kit',
        3
      );
      stmt.run(
        'Google Sheets Otomasi Database Member & Billing',
        'Google Sheets',
        'sheets',
        'Template Google Spreadsheet resmi untuk pembukuan membership, log aktivasi OTP, dan rekap metrik pelanggan.',
        '1. Buka tautan Google Sheets berikut.\n2. Klik menu File > Buat Salinan (Make a Copy) ke Google Drive Anda sendiri.\n3. Sesuaikan kolom nama member dan status membership Anda.',
        'Template Google Sheets resmi untuk manajemen membership dan operasional Kyzoo LMS.',
        'https://docs.google.com/spreadsheets',
        '📊 Spreadsheet',
        4
      );
    }
  } catch (e) {
    // Abaikan jika sudah ada
  }
}

// Database Helper Wrappers (Mendukung async/await untuk PostgreSQL & SQLite)
const DB = {
  get isPostgres() {
    return Boolean(getDatabaseUrl());
  },

  get raw() {
    return this.isPostgres ? getPgPool() : sqliteDb;
  },

  async get(sql, ...params) {
    if (this.isPostgres) {
      const p = getPgPool();
      if (!p) throw new Error('Koneksi PostgreSQL (POSTGRES_URL / DATABASE_URL) tidak tersedia.');
      const pgSql = toPgSql(sql);
      const res = await p.query(pgSql, params);
      return res.rows[0] || null;
    } else {
      if (!sqliteDb) throw new Error('Database lokal tidak terhubung.');
      const stmt = sqliteDb.prepare(sql);
      return stmt.get(...params) || null;
    }
  },

  async all(sql, ...params) {
    if (this.isPostgres) {
      const p = getPgPool();
      if (!p) throw new Error('Koneksi PostgreSQL (POSTGRES_URL / DATABASE_URL) tidak tersedia.');
      const pgSql = toPgSql(sql);
      const res = await p.query(pgSql, params);
      return res.rows;
    } else {
      if (!sqliteDb) throw new Error('Database lokal tidak terhubung.');
      const stmt = sqliteDb.prepare(sql);
      return stmt.all(...params);
    }
  },

  async run(sql, ...params) {
    if (this.isPostgres) {
      const p = getPgPool();
      if (!p) throw new Error('Koneksi PostgreSQL (POSTGRES_URL / DATABASE_URL) tidak tersedia.');
      let pgSql = toPgSql(sql);
      const isInsert = /^\s*INSERT\s+INTO/i.test(sql);
      if (isInsert && !/RETURNING/i.test(sql)) {
        pgSql += ' RETURNING id';
      }
      const res = await p.query(pgSql, params);
      return {
        changes: res.rowCount,
        lastInsertRowid: res.rows && res.rows[0] ? res.rows[0].id : null
      };
    } else {
      if (!sqliteDb) throw new Error('Database lokal tidak terhubung.');
      const stmt = sqliteDb.prepare(sql);
      return stmt.run(...params);
    }
  }
};

module.exports = DB;
