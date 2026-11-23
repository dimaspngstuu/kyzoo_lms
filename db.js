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
      } catch (err) {
        console.error('[DB] Gagal menginisialisasi PostgreSQL Pool:', err.message);
      }
    }
  }
  return pool;
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
