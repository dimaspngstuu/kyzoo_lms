require('dotenv').config();
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

let isPostgres = false;
let pool = null;
let sqliteDb = null;

// Helper: Konversi penanda parameter SQLite '?' ke format PostgreSQL '$1, $2, $3...'
function toPgSql(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
  try {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false
      },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
    isPostgres = true;
    console.log('[DB] Mode Aktif: Terhubung ke Supabase PostgreSQL Cloud Database.');
  } catch (err) {
    console.error('[DB] Gagal menginisialisasi PostgreSQL Pool:', err.message);
  }
}

if (!isPostgres) {
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
    console.warn('[DB] SQLite tidak tersedia di environment ini:', sqliteErr.message);
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
  `);

  // Seed default data if empty
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    db.prepare(`
      INSERT INTO users (name, email, password, role, avatar)
      VALUES 
        ('Admin Kyzoo', 'admin@kyzoo.com', 'admin123', 'admin', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'),
        ('Dimas Pangestu', 'user@kyzoo.com', 'user123', 'pelanggan', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80')
    `).run();
  }

  const courseCount = db.prepare('SELECT COUNT(*) as count FROM courses').get();
  if (courseCount.count === 0) {
    const c1 = db.prepare(`
      INSERT INTO courses (code, title, slug, category, description, thumbnail)
      VALUES (
        'CRS-202611-001',
        'Web Design : From Figma to Web',
        'web-design-from-figma-to-web',
        'UI/UX & Development',
        'Panduan lengkap merancang antarmuka profesional di Figma dan mengubahnya menjadi kode web responsif siap pakai.',
        'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=600&q=80'
      )
    `).run();
    const c1Id = c1.lastInsertRowid;

    const ch1 = db.prepare(`INSERT INTO chapters (course_id, title, sort_order) VALUES (?, 'Bab 1: Konsep & Persiapan Desain', 1)`).run(c1Id);
    const ch2 = db.prepare(`INSERT INTO chapters (course_id, title, sort_order) VALUES (?, 'Bab 2: Desain Komponen & Sistem Warna', 2)`).run(c1Id);
    const ch3 = db.prepare(`INSERT INTO chapters (course_id, title, sort_order) VALUES (?, 'Bab 3: Implementasi Layout & Responsif', 3)`).run(c1Id);

    db.prepare(`
      INSERT INTO lessons (chapter_id, title, video_source, video_url, content_text, duration_minutes, sort_order)
      VALUES 
        (?, 'Pengenalan Workspace & Navigasi Alat', 'youtube', 'https://www.youtube.com/watch?v=jwPkfa858tc', 'Di materi awal ini, kita mempelajari tata letak lembar kerja, panel layer, serta pengaturan frame dasar untuk memulai proyek desain dengan rapi.', 12, 1),
        (?, 'Menyiapkan Grid System & Tipografi', 'youtube', 'https://www.youtube.com/watch?v=FTFaQWZBqQ8', 'Panduan menentukan 12-column grid layout, skala tipografi modular, dan font pairing agar teks nyaman dibaca di layar HP maupun laptop.', 15, 2)
    `).run(ch1.lastInsertRowid, ch1.lastInsertRowid);

    db.prepare(`
      INSERT INTO lessons (chapter_id, title, video_source, video_url, content_text, duration_minutes, sort_order)
      VALUES 
        (?, 'Membuat Komponen Navbar & Tombol Interaktif', 'youtube', 'https://www.youtube.com/watch?v=F_f82GkKqE8', 'Teknik pembuatan komponen reusable dengan auto-layout, varian hover state, dan token warna konsisten.', 18, 1),
        (?, 'Merancang Kartu Metrik Dashboard Pastel', 'youtube', 'https://www.youtube.com/watch?v=1rP_858tc98', 'Tutorial membuat kartu ringkasan status dengan warna pastel yang lembut, ikon vektor tajam, dan indikator persentase bulat.', 14, 2)
    `).run(ch2.lastInsertRowid, ch2.lastInsertRowid);

    db.prepare(`
      INSERT INTO lessons (chapter_id, title, video_source, video_url, content_text, duration_minutes, sort_order)
      VALUES 
        (?, 'Layouting 3-Kolom Anti-AI & Spasi Bersih', 'youtube', 'https://www.youtube.com/watch?v=7uK06h_R98k', 'Menerapkan hierarki visual buatan desainer manusia: spasi lapang, sudut membulat modern, dan sidebar ergonomis.', 20, 1)
    `).run(ch3.lastInsertRowid);
  }
}

// Database Helper Wrappers (Mendukung async/await untuk PostgreSQL & SQLite)
const DB = {
  isPostgres,
  raw: isPostgres ? pool : sqliteDb,

  async get(sql, ...params) {
    if (this.isPostgres) {
      const pgSql = toPgSql(sql);
      const res = await pool.query(pgSql, params);
      return res.rows[0] || null;
    } else {
      if (!sqliteDb) throw new Error('Database tidak terhubung');
      const stmt = sqliteDb.prepare(sql);
      return stmt.get(...params) || null;
    }
  },

  async all(sql, ...params) {
    if (this.isPostgres) {
      const pgSql = toPgSql(sql);
      const res = await pool.query(pgSql, params);
      return res.rows;
    } else {
      if (!sqliteDb) throw new Error('Database tidak terhubung');
      const stmt = sqliteDb.prepare(sql);
      return stmt.all(...params);
    }
  },

  async run(sql, ...params) {
    if (this.isPostgres) {
      let pgSql = toPgSql(sql);
      const isInsert = /^\s*INSERT\s+INTO/i.test(sql);
      if (isInsert && !/RETURNING/i.test(sql)) {
        pgSql += ' RETURNING id';
      }
      const res = await pool.query(pgSql, params);
      return {
        changes: res.rowCount,
        lastInsertRowid: res.rows && res.rows[0] ? res.rows[0].id : null
      };
    } else {
      if (!sqliteDb) throw new Error('Database tidak terhubung');
      const stmt = sqliteDb.prepare(sql);
      return stmt.run(...params);
    }
  }
};

module.exports = DB;
