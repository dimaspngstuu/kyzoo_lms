# PRD: Kyzoo - Sistem LMS & Video Tutorial Pelanggan
================================================================================
VERSI         : v1.0.0
STATUS        : DRAFT (MENUNGGU PERSETUJUAN "OKE TERAPKAN")
ARSITEK SISTEM: Arsitek Core v2.0.0
TANGGAL       : 2026-11-20
================================================================================

================================================================================
ZONA ATAS: SPESIFIKASI KEBUTUHAN PRODUK (BLUEPRINT AWAL)
================================================================================

## 1. NAMA PROJEK, MASALAH & KRITERIA SUKSES
- **Nama Aplikasi**: **Kyzoo** (Learning Management System & Video Tutorial Produk)
- **Masalah yang Diselesaikan**:
  Pelanggan sering kesulitan memahami penggunaan produk atau layanan jika hanya diberikan teks manual yang panjang. Mereka membutuhkan pusat pembelajaran terpadu berbasis video tutorial yang runtut, terstruktur dalam modul/bab, dapat dipelajari mandiri, serta memiliki pelacak progres belajar yang jelas.
- **Kriteria Sukses**:
  1. Pelanggan dapat mencari dan menonton video tutorial (baik embed YouTube, Vimeo, Google Drive, maupun video yang diunggah langsung) disertai penjelasan teks pendukung.
  2. Pelanggan dapat menandai materi yang sudah dipelajari ("Tandai Selesai") dan memantau persentase kemajuan belajar di dashboard secara real-time.
  3. Admin memiliki antarmuka CRUD lengkap (Create, Read, Update, Delete) untuk mengelola kursus, bab (chapter), dan materi pelajaran/video tanpa hambatan.
  4. Desain antarmuka 100% mengadopsi estetika referensi (dashboard ala "Quyl" dengan layout 3 panel: Sidebar modern ungu-violet, Topbar pencarian, 3 Kartu Metrik Pastel, Progress List, dan Panel Kalender/Jadwal di kanan) dengan prinsip Anti-AI & Human-Crafted Look.
  5. Sistem siap dijalankan langsung di komputer lokal pengguna menggunakan Node.js tanpa konfigurasi rumit.

---

## 2. PERAN PENGGUNA (USER ROLES & PERMISSIONS)
Sistem memiliki 2 peran utama:
1. **Admin**:
   - Hak akses penuh ke Dashboard Admin dan Katalog Belajar.
   - Mengelola Kursus (Courses): Tambah judul, deskripsi, thumbnail, kategori.
   - Mengelola Bab (Chapters): Mengelompokkan materi secara hierarkis.
   - Mengelola Materi (Lessons): Menambah teks panduan, memasukkan URL video (YouTube/Vimeo/Drive) atau upload file video lokal, mengatur durasi, dan menghapus/mengubah materi.
   - Melihat ringkasan metrik statistik materi dan aktivitas pengguna.
2. **Pelanggan (Customer / User Biasa)**:
   - Hak akses hanya baca (Read-Only) untuk materi dan video.
   - Melihat dashboard pembelajaran personal, melanjutkan kursus terakhir (*Resume Course*).
   - Menonton video tutorial dengan pemutar responsif dan membaca teks panduan.
   - Menandai materi selesai (*Checklist Mark as Completed*).
   - Memantau capaian progres modul (0% - 100%).

---

## 3. ARSITEKTUR & LINGKUNGAN KERJA
- **Platform Runtime**: Node.js (v24.22+ LTS)
- **Backend Framework**: Express.js (Arsitektur MVC yang rapi, ringan, dan cepat)
- **Basis Data**: SQLite (`better-sqlite3` atau `sqlite3` driver) tersimpan aman di `data/kyzoo.db`
- **Frontend Engine**: Server-Side Rendered (EJS) dipadukan dengan Tailwind CSS, Heroicons SVG inline, dan Alpine.js untuk interaksi mikro (dropdown, tab, modal, pencarian dinamis).
- **Video Player**: Responsif HTML5 Video Player untuk file lokal + Responsive Iframe Player dengan auto-converter untuk link YouTube/Vimeo/Google Drive.
- **Autentikasi**: Express Session berbasis Cookie terenkripsi, dilengkapi fitur *1-Click Demo Login* (Admin & Pelanggan) untuk kemudahan pengujian instan.

---

## 4. ALUR KERJA APLIKASI (USER FLOW)

### A. Alur Pelanggan (Customer Journey)
```
[Buka Aplikasi] 
       │
       ▼
[Halaman Login / Klik Demo Pelanggan] 
       │
       ▼
[Dashboard Kyzoo (Persis Referensi Gambar)]
 ├── Kartu Lanjut Belajar (Resume Banner) ──► Langsung lanjut ke materi terakhir
 ├── 3 Kartu Metrik Status (Materi Selesai, Total Bab, Persentase Capaian)
 ├── Daftar Kursus Saya (Tab Aktif & Selesai dengan Progress Bar)
 └── Panel Kanan (Kalender Mini & Jadwal Rekomendasi Belajar)
       │
       ▼
[Halaman Pembelajaran (Course & Lesson View)]
 ├── Sidebar Daftar Bab & Materi (Indikator Ceklis Hijau jika sudah tuntas)
 ├── Layar Pemutar Video (YouTube / Uploaded MP4)
 ├── Artikel Teks Panduan & Tips Tambahan
 └── Tombol "Tandai Selesai & Lanjut" ──► Update Progress Bar ke 100%
```

### B. Alur Admin (Content Management Journey)
```
[Login Admin / Klik Demo Admin] 
       │
       ▼
[Dashboard Admin Kyzoo]
 ├── Akses Menu "Kelola Kursus & Materi"
 ├── Tambah Kursus Baru (Judul, Kategori, Deskripsi, Thumbnail)
 ├── Tambah Bab / Chapter (Misal: "Bab 1: Persiapan Awal", "Bab 2: Panduan Fitur")
 ├── Tambah Pelajaran / Video:
 │     ├── Pilihan A: Masukkan Link Video (YouTube / Vimeo / Drive)
 │     └── Pilihan B: Unggah File Video MP4
 └── Aksi Edit & Hapus (CRUD instan)
```

---

## 5. DESAIN BASIS DATA (DATABASE SCHEMA)

### 1. Tabel `users`
| Kolom | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | INTEGER (PK, Auto) | ID Unik Pengguna |
| `name` | TEXT | Nama Lengkap (Contoh: "Dipu Paul", "Admin Kyzoo") |
| `email` | TEXT (Unique) | Alamat Email Login |
| `password` | TEXT | Hash Password / Sandi |
| `role` | TEXT | Peran Pengguna: `'admin'` atau `'pelanggan'` |
| `avatar` | TEXT | URL / Path Foto Avatar |
| `created_at` | DATETIME | Waktu Pendaftaran Akun |

### 2. Tabel `courses`
| Kolom | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | INTEGER (PK, Auto) | ID Unik Kursus |
| `code` | TEXT (Unique) | Kode Unik Kursus (Contoh: `CRS-2026-001`) |
| `title` | TEXT | Judul Kursus (Contoh: "Web Design: From Figma to Web") |
| `slug` | TEXT (Unique) | URL ramah SEO |
| `category` | TEXT | Kategori (Contoh: "Tutorial Penggunaan", "Dasar", "Lanjutan") |
| `description`| TEXT | Deskripsi lengkap panduan |
| `thumbnail` | TEXT | URL gambar cover modul |
| `is_active` | INTEGER | Status tayang (1 = Aktif, 0 = Draft) |
| `created_at` | DATETIME | Waktu Dibuat |

### 3. Tabel `chapters`
| Kolom | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | INTEGER (PK, Auto) | ID Unik Bab |
| `course_id` | INTEGER (FK) | Relasi ke `courses.id` |
| `title` | TEXT | Nama Bab (Contoh: "Bab 1: Pengenalan Aplikasi") |
| `sort_order`| INTEGER | Nomor Urut Tampil |
| `created_at` | DATETIME | Waktu Dibuat |

### 4. Tabel `lessons`
| Kolom | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | INTEGER (PK, Auto) | ID Unik Materi |
| `chapter_id`| INTEGER (FK) | Relasi ke `chapters.id` |
| `title` | TEXT | Judul Materi (Contoh: "Cara Menghubungkan Akun") |
| `video_source`| TEXT | Sumber: `'youtube'`, `'vimeo'`, `'drive'`, `'upload'` |
| `video_url` | TEXT | Link URL Video atau Path Berkas Video yang diunggah |
| `content_text`| TEXT | Penjelasan panduan tertulis / rangkuman teks |
| `duration_minutes` | INTEGER | Estimasi durasi video (menit) |
| `sort_order`| INTEGER | Nomor Urut Pelajaran dalam Bab |
| `created_at` | DATETIME | Waktu Dibuat |

### 5. Tabel `user_progress`
| Kolom | Tipe | Keterangan |
| :--- | :--- | :--- |
| `id` | INTEGER (PK, Auto) | ID Progress |
| `user_id` | INTEGER (FK) | Relasi ke `users.id` |
| `lesson_id` | INTEGER (FK) | Relasi ke `lessons.id` |
| `is_completed`| INTEGER | 1 = Selesai Ditonton, 0 = Belum |
| `completed_at`| DATETIME | Waktu Penyelesaian |

---

## 6. ATURAN VALIDASI & LOGIKA KHUSUS

1. **Parser Otomatis Link YouTube & Eksternal**:
   - Jika admin memasukkan URL YouTube standar (`https://www.youtube.com/watch?v=XXXX` atau `https://youtu.be/XXXX`), backend otomatis mengekstrak Video ID dan merender URL aman iframe (`https://www.youtube-nocookie.com/embed/XXXX`).
2. **Formula Hitung Progress Real-Time**:
   $$\text{Progress Kursus (\%)} = \left( \frac{\text{Jumlah Lesson yang diselesaikan user}}{\text{Total Lesson dalam kursus}} \right) \times 100$$
   - Ditampilkan dalam format progress bar halus dan persentase badge bulat persis di kartu gambar referensi.
3. **Penomoran Kode Unik Kursus**:
   - Format: `CRS-YYYYMM-XXX` (Contoh: `CRS-202611-001`) yang terhitung otomatis secara sekuensial tanpa risiko tabrakan data.
4. **Proteksi Hak Akses (RBAC Middleware)**:
   - Pelanggan yang mencoba mengakses rute `/admin/*` otomatis dialihkan ke halaman dashboard dengan peringatan yang sopan.

---

## 7. RENCANA ANTARMUKA (UI/UX MERUJUK PADA REFERENSI GAMBAR)

1. **Sidebar Kiri Khas "Quyl" / "Kyzoo"**:
   - Logo "Kyzoo" dengan lambang daun/pena minimalis.
   - Menu Navigasi:
     - 🗂️ **Dashboard** (Tombol aktif dengan background ungu pill & teks putih)
     - 📚 **Courses** (Daftar semua tutorial)
     - 📖 **Chapter** (Navigasi bab & silabus)
     - ❓ **Help** (Pusat Bantuan & Panduan)
     - ⚙️ **Settings** (Pengaturan Akun)
   - Menu Bawah:
     - 💬 **FAQ**
     - 🚪 **Logout**
2. **Topbar**:
   - Judul Halaman dinamis ("Dashboard")
   - Kotak Pencarian instan ("Search here...")
   - Ikon Pesan, Notifikasi, dan Profil Avatar ("Dipu Paul" / Nama User dengan badge role).
3. **Main Content Area**:
   - **Banner Resume Belajar**: Thumbnail dinamis, Judul Materi Lanjutan, Icon ringkasan, dan Tombol `▶ Resume` ungu yang mencolok.
   - **3 Kartu Status Pastel (Anti-AI Aesthetic)**:
     - Kartu Peach: Total Materi Diselesaikan (dengan lingkaran persentase 59%).
     - Kartu Pink: Total Panduan / Tugas (dengan lingkaran persentase).
     - Kartu Soft Green: Total Modul Selesai (dengan lingkaran persentase).
   - **Tabel / List "My Courses"**:
     - Filter Tab: `Active` & `Completed`
     - Kolom: `#`, `Course Name`, `Completed` (Progress bar warna-warni halus), `Status`.
4. **Sidebar Kanan (Panel Status Tambahan)**:
   - Kalender mini interaktif dengan penanda tanggal aktif warna ungu.
   - Widget "Upcoming / Rekomendasi Modul": Kartu tanggal kecil (misal "29 Nov") dengan tag "Tutorial", "Lessons", dsb.
5. **Panel Admin CRUD**:
   - Tombol "➕ Tambah Kursus / Materi Baru" di pojok atas.
   - Modal form yang elegan untuk membuat materi, input link video, atau upload file MP4.
   - Aksi Edit & Hapus dengan dialog konfirmasi aman.

---

## 8. KRITERIA PENGUJIAN (TESTING CHECKLIST BAGI PENGGUNA)
- [ ] Buka aplikasi di browser (localhost), halaman login menyambut dengan pilihan 1-Click Demo (Admin & Pelanggan).
- [ ] Login sebagai Pelanggan: Dashboard tampil persis seperti gambar referensi (Kartu Resume, Kartu Status pastel, Progress bar).
- [ ] Buka salah satu video tutorial: Pemutar video berjalan lancar (YouTube & video lokal), teks artikel terbaca rapi.
- [ ] Klik tombol "Tandai Selesai": Indikator centang muncul, progress bar di dashboard bertambah secara akurat.
- [ ] Login sebagai Admin: Terdapat tombol dan menu kelola materi (Tambah Kursus, Tambah Bab, Tambah Video/Teks).
- [ ] Lakukan penambahan materi baru dan cek apakah langsung muncul di sisi Pelanggan.

================================================================================
ZONA BAWAH: MASTER CONTEXT & LOGIKA SISTEM TERKINI (LIVING CONTEXT)
================================================================================
- **Status Sistem**: SELESAI DIIMPLEMENTASIKAN (VERIFIED)
- **Status Arsitektur**: Node.js + Express.js + SQLite (node:sqlite) + Tailwind CSS + EJS
- **Basis Data Aktif**: `data/kyzoo.db`
  - Tabel `users`: 2 user default (`admin@kyzoo.com` [admin], `user@kyzoo.com` [pelanggan])
  - Tabel `courses`: 3 kursus default aktif (Web Design Figma to Web, HTML Basics, Data with Python)
  - Tabel `chapters`: 5 bab modul
  - Tabel `lessons`: 8 video tutorial (YouTube streaming & lokal MP4 ready)
  - Tabel `user_progress`: Relasi checklist progres belajar per pengguna
- **Akun Bawaan (Default Credentials)**:
  - 👑 **Admin**: `admin@kyzoo.com` / `admin123` (Hak akses CRUD penuh materi di `/admin`)
  - 🎓 **Pelanggan**: `user@kyzoo.com` / `user123` (Hak tonton, baca, checklist di `/dashboard`)
  - *Fitur Pintas*: Tersedia tombol 1-Click Demo Login instan di layar `/login`
- **Port Server**: `http://localhost:3000`
- **Perintah Jalankan**: `npm start` atau `node server.js`
- **Riwayat Perubahan**:
  - `2026-11-20`: Inisialisasi awal arsitektur dan penyusunan modul Kyzoo LMS v1.0.0.
  - `2026-11-20`: Implementasi lengkap seluruh fitur (Dashboard Quyl 1:1, Ruang Belajar Video, AJAX Checklist Progress, Admin CMS CRUD, Otentikasi Sesi & 1-Click Demo).
  - `2026-11-20`: Revisi UI (Penghapusan section sidebar kanan: Status Kalender & Upcoming Tasks agar layout konten utama lebih lapang dan fokus).
  - `2026-11-20`: Revisi Mobile-First & UI Cleanup:
    * Penghapusan ikon pesan & notifikasi di topbar sesuai tangkapan layar pengguna.
    * Implementasi Bottom Navigation Bar khusus perangkat mobile (HP) untuk akses cepat jempol (Dashboard, Kursus, Admin, Bantuan, Profil).
    * Transformasi tampilan daftar kursus menjadi kartu responsif (Course Cards) pada layar HP agar tidak ada teks kepotong atau scroll horizontal.
    * Penyesuaian tombol aksi video player & silabus agar ramah layar sentuh ponsel.
  - `2026-11-20`: Penambahan Hero Greeting Banner (Sesuai Referensi Gambar 2):
    * Sapaan hangat personal & dinamis berdasarkan waktu ("Selamat Pagi / Siang / Sore / Malam, Dimas Pangestu!").
    * Subjudul motivasi belajar: "Mau belajar atau praktik membuat web app AI apa hari ini?".
    * Kotak pencarian materi interaktif bergaya gelap modern dilengkapi shortcut shortcut keyboard `Ctrl + K`.
  - `2026-11-20`: Penyederhanaan Layout Dashboard Utama:
    * Penghapusan kartu 'Lanjutkan Belajar' (Resume Banner) dan 3 kartu status pastel (Lessons, Assignments, Tests).
    * Alur dashboard menjadi sangat bersih & langsung: Hero Greeting ("Selamat Pagi, Dimas Pangestu!") langsung tersambung ke daftar modul pembelajaran ("My Courses").
  - `2026-11-20`: Fungsionalitas Live Search & Pembersihan Placeholder:
    * Penghapusan teks "atau Zettbos Library" dari input pencarian.
    * Pembuatan endpoint `/api/search` untuk pencarian instan modul kursus dan video materi.
    * Implementasi live search dropdown interaktif dan in-page live filter pada daftar kursus.
  - `2026-11-20`: Perbaikan Bug Potongan Dropdown Pencarian:
    * Mengatasi pemotongan visual dropdown hasil pencarian akibat `overflow-hidden` pada hero banner.
    * Memisahkan ambient glow ke layer independen sehingga dropdown mengambang bebas di atas kartu kursus tanpa terpotong.
  - `2026-11-20`: Penyederhanaan Navigasi Sidebar & Bottom Bar:
    * Penghapusan menu Chapter, Help, dan FAQ dari bilah navigasi samping (Sidebar) dan bottom bar mobile.
    * Menu utama kini terfokus padat: Dashboard, Courses, Settings, Panel Admin (khusus role Admin), dan Logout.
    * Perbaikan parameter binding SQL pada perhitungan total user dashboard admin.
  - `2026-11-20`: Implementasi Pohon Struktur Hierarki Kursus:
    * Di Sidebar: Tetap bersih dan minimalis sesuai permintaan pengguna — hanya tombol **Courses** tunggal tanpa pohon turunan agar tidak terlalu padat.
    * Di Dashboard: Tabel kursus dan kartu mobile memiliki toggle expandable (📂 [X] Bab Turunan ▾) untuk melihat bab dan materi video langsung di tempat.
    * Di Halaman Detail Kursus (`/courses/:slug`): Visual silabus menyajikan hierarki lengkap (Nomor Bab, pohon konektor materi, durasi video, dan status penyelesaian).
    * Di Pemutar Belajar (`/learn/:courseSlug/:lessonId`): Daftar modul di sidebar pemutar video menyertakan penanda nomor bab yang terstruktur rapi.
