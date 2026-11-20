const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'kyzoo.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode and foreign keys for high reliability & speed
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize Tables
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
`);

// Database Helper Wrappers
const DB = {
  raw: db,
  get(sql, ...params) {
    const stmt = db.prepare(sql);
    return stmt.get(...params);
  },
  all(sql, ...params) {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  },
  run(sql, ...params) {
    const stmt = db.prepare(sql);
    return stmt.run(...params);
  }
};

// Seed Default Data if empty
function seedDatabase() {
  const userCount = DB.get('SELECT COUNT(*) as count FROM users');
  if (userCount.count === 0) {
    console.log('[DB] Seeding default users...');
    // Seed Admin & Pelanggan
    DB.run(`
      INSERT INTO users (name, email, password, role, avatar)
      VALUES 
        ('Admin Kyzoo', 'admin@kyzoo.com', 'admin123', 'admin', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'),
        ('Dipu Paul', 'user@kyzoo.com', 'user123', 'pelanggan', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80')
    `);
  }

  const courseCount = DB.get('SELECT COUNT(*) as count FROM courses');
  if (courseCount.count === 0) {
    console.log('[DB] Seeding default courses and lessons...');

    // Course 1 (Main reference match: Web Design: From Figma to Web)
    const c1 = DB.run(`
      INSERT INTO courses (code, title, slug, category, description, thumbnail)
      VALUES (
        'CRS-202611-001',
        'Web Design : From Figma to Web',
        'web-design-from-figma-to-web',
        'UI/UX & Development',
        'Panduan lengkap merancang antarmuka profesional di Figma dan mengubahnya menjadi kode web responsif siap pakai.',
        'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=600&q=80'
      )
    `);
    const c1Id = c1.lastInsertRowid;

    // Chapters for Course 1
    const ch1 = DB.run(`INSERT INTO chapters (course_id, title, sort_order) VALUES (?, 'Bab 1: Konsep & Persiapan Desain', 1)`, c1Id);
    const ch2 = DB.run(`INSERT INTO chapters (course_id, title, sort_order) VALUES (?, 'Bab 2: Desain Komponen & Sistem Warna', 2)`, c1Id);
    const ch3 = DB.run(`INSERT INTO chapters (course_id, title, sort_order) VALUES (?, 'Bab 3: Implementasi Layout & Responsif', 3)`, c1Id);

    // Lessons for Chapter 1
    DB.run(`
      INSERT INTO lessons (chapter_id, title, video_source, video_url, content_text, duration_minutes, sort_order)
      VALUES 
        (?, 'Pengenalan Workspace & Navigasi Alat', 'youtube', 'https://www.youtube.com/watch?v=jwPkfa858tc', 'Di materi awal ini, kita mempelajari tata letak lembar kerja, panel layer, serta pengaturan frame dasar untuk memulai proyek desain dengan rapi.', 12, 1),
        (?, 'Menyiapkan Grid System & Tipografi', 'youtube', 'https://www.youtube.com/watch?v=FTFaQWZBqQ8', 'Panduan menentukan 12-column grid layout, skala tipografi modular, dan font pairing agar teks nyaman dibaca di layar HP maupun laptop.', 15, 2)
    `, ch1.lastInsertRowid, ch1.lastInsertRowid);

    // Lessons for Chapter 2
    DB.run(`
      INSERT INTO lessons (chapter_id, title, video_source, video_url, content_text, duration_minutes, sort_order)
      VALUES 
        (?, 'Membuat Komponen Navbar & Tombol Interaktif', 'youtube', 'https://www.youtube.com/watch?v=F_f82GkKqE8', 'Teknik pembuatan komponen reusable dengan auto-layout, varian hover state, dan token warna konsisten.', 18, 1),
        (?, 'Merancang Kartu Metrik Dashboard Pastel', 'youtube', 'https://www.youtube.com/watch?v=1rP_858tc98', 'Tutorial membuat kartu ringkasan status dengan warna pastel yang lembut, ikon vektor tajam, dan indikator persentase bulat.', 14, 2)
    `, ch2.lastInsertRowid, ch2.lastInsertRowid);

    // Lessons for Chapter 3
    DB.run(`
      INSERT INTO lessons (chapter_id, title, video_source, video_url, content_text, duration_minutes, sort_order)
      VALUES 
        (?, 'Layouting 3-Kolom Anti-AI & Spasi Bersih', 'youtube', 'https://www.youtube.com/watch?v=7uK06h_R98k', 'Menerapkan hierarki visual buatan desainer manusia: spasi lapang, sudut membulat modern, dan sidebar ergonomis.', 20, 1)
    `, ch3.lastInsertRowid);

    // Course 2 (Html Basics)
    const c2 = DB.run(`
      INSERT INTO courses (code, title, slug, category, description, thumbnail)
      VALUES (
        'CRS-202611-002',
        'Html Basics & Struktur Semantik',
        'html-basics',
        'Frontend Fundamental',
        'Kuasai pondasi web modern menggunakan tag semantik HTML5 yang ramah SEO dan mudah dipahami mesin pencari.',
        'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80'
      )
    `);
    const c2Id = c2.lastInsertRowid;
    const ch2_1 = DB.run(`INSERT INTO chapters (course_id, title, sort_order) VALUES (?, 'Bab 1: Tag Esensial HTML5', 1)`, c2Id);
    DB.run(`
      INSERT INTO lessons (chapter_id, title, video_source, video_url, content_text, duration_minutes, sort_order)
      VALUES 
        (?, 'Struktur Dasar Dokumen HTML5', 'youtube', 'https://www.youtube.com/watch?v=MDLn5-zSQQI', 'Memahami tag <!DOCTYPE html>, <html>, <head>, dan <body> serta cara kerja peramban membaca berkas.', 10, 1),
        (?, 'Formulir Interaktif & Validasi Input', 'youtube', 'https://www.youtube.com/watch?v=fNcJuPIZ2WE', 'Belajar membuat formulir input, tombol kirim, dropdown, dan tipe data input terkini.', 15, 2)
    `, ch2_1.lastInsertRowid, ch2_1.lastInsertRowid);

    // Course 3 (Data with Python)
    const c3 = DB.run(`
      INSERT INTO courses (code, title, slug, category, description, thumbnail)
      VALUES (
        'CRS-202611-003',
        'Data with Python & Visualisasi',
        'data-with-python',
        'Data & Analytics',
        'Tutorial praktis menganalisis data spreadsheet, filtering, dan visualisasi grafik interaktif menggunakan Python.',
        'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=80'
      )
    `);
    const c3Id = c3.lastInsertRowid;
    const ch3_1 = DB.run(`INSERT INTO chapters (course_id, title, sort_order) VALUES (?, 'Bab 1: Pengolahan Dataset', 1)`, c3Id);
    DB.run(`
      INSERT INTO lessons (chapter_id, title, video_source, video_url, content_text, duration_minutes, sort_order)
      VALUES 
        (?, 'Membaca Berkas CSV & Pembersihan Data', 'youtube', 'https://www.youtube.com/watch?v=vmEHCJofslg', 'Langkah awal membaca data eksternal, membersihkan nilai kosong (null), dan mengubah tipe data kolom.', 18, 1)
    `, ch3_1.lastInsertRowid);

    // Seed progress for Dipu Paul (user_id = 2) on Course 1 Lesson 1 & Lesson 2
    DB.run(`INSERT OR IGNORE INTO user_progress (user_id, lesson_id, is_completed) VALUES (2, 1, 1), (2, 2, 1)`);
  }
}

seedDatabase();

module.exports = DB;
