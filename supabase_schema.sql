-- ==============================================================================
-- KYZOO LMS - SUPABASE POSTGRESQL INITIAL DATABASE SCHEMA & SEED DATA
-- Salin dan jalankan skrip ini langsung di "SQL Editor" pada Dashboard Supabase
-- ==============================================================================

-- 1. TABEL PENGGUNA (users)
CREATE TABLE IF NOT EXISTS public.users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'pelanggan',
  avatar TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABEL KURSUS (courses)
CREATE TABLE IF NOT EXISTS public.courses (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  thumbnail TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABEL BAB (chapters)
CREATE TABLE IF NOT EXISTS public.chapters (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. TABEL MATERI / EPISODE (lessons)
CREATE TABLE IF NOT EXISTS public.lessons (
  id SERIAL PRIMARY KEY,
  chapter_id INTEGER NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  video_source TEXT NOT NULL DEFAULT 'youtube',
  video_url TEXT,
  content_text TEXT,
  duration_minutes INTEGER DEFAULT 10,
  sort_order INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. TABEL PROGRES BELAJAR MEMBER (user_progress)
CREATE TABLE IF NOT EXISTS public.user_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  is_completed INTEGER DEFAULT 1,
  completed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_user_lesson UNIQUE(user_id, lesson_id)
);

-- 6. TABEL KODE OTP EMAIL (email_otps)
CREATE TABLE IF NOT EXISTS public.email_otps (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  is_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- INDEX PERFORMA TINGGI (HIGH-SPEED ZERO-LAG QUERY INDEXES)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_courses_slug ON public.courses(slug);
CREATE INDEX IF NOT EXISTS idx_courses_active ON public.courses(is_active);
CREATE INDEX IF NOT EXISTS idx_chapters_course ON public.chapters(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_chapter ON public.lessons(chapter_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_user ON public.user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_lesson ON public.user_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_email_otps_email ON public.email_otps(email);

-- ==============================================================================
-- SETUP SUPABASE STORAGE (BUCKET UNTUK AVATAR & THUMBNAIL)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyzoo-assets', 'kyzoo-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Kebijakan Akses Storage (Publik dapat membaca dan mengunggah gambar)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Kyzoo Assets Public Access' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Kyzoo Assets Public Access" ON storage.objects
      FOR ALL
      USING (bucket_id = 'kyzoo-assets')
      WITH CHECK (bucket_id = 'kyzoo-assets');
  END IF;
END $$;

-- ==============================================================================
-- SEED DATA AWAL (DEMO ADMIN, MEMBER, DAN KURSUS PERDANA)
-- ==============================================================================

-- Akun Demo Admin & Pelanggan
INSERT INTO public.users (name, email, password, role, avatar)
VALUES 
  ('Admin Kyzoo', 'admin@kyzoo.com', 'admin123', 'admin', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'),
  ('Dimas Pangestu', 'user@kyzoo.com', 'user123', 'pelanggan', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80')
ON CONFLICT (email) DO NOTHING;

-- Kursus 1: Web Design : From Figma to Web
INSERT INTO public.courses (code, title, slug, category, description, thumbnail)
VALUES (
  'CRS-202611-001',
  'Web Design : From Figma to Web',
  'web-design-from-figma-to-web',
  'UI/UX & Development',
  'Panduan lengkap merancang antarmuka profesional di Figma dan mengubahnya menjadi kode web responsif siap pakai.',
  'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=600&q=80'
)
ON CONFLICT (code) DO NOTHING;

-- Bab & Materi untuk Kursus 1
DO $$
DECLARE
  v_course_id INT;
  v_ch1_id INT;
  v_ch2_id INT;
  v_ch3_id INT;
BEGIN
  SELECT id INTO v_course_id FROM public.courses WHERE code = 'CRS-202611-001';
  
  IF v_course_id IS NOT NULL THEN
    -- Bab 1
    INSERT INTO public.chapters (course_id, title, sort_order)
    VALUES (v_course_id, 'Bab 1: Konsep & Persiapan Desain', 1)
    RETURNING id INTO v_ch1_id;

    INSERT INTO public.lessons (chapter_id, title, video_source, video_url, content_text, duration_minutes, sort_order)
    VALUES 
      (v_ch1_id, 'Pengenalan Workspace & Navigasi Alat', 'youtube', 'https://www.youtube.com/watch?v=jwPkfa858tc', 'Di materi awal ini, kita mempelajari tata letak lembar kerja, panel layer, serta pengaturan frame dasar untuk memulai proyek desain dengan rapi.', 12, 1),
      (v_ch1_id, 'Menyiapkan Grid System & Tipografi', 'youtube', 'https://www.youtube.com/watch?v=FTFaQWZBqQ8', 'Panduan menentukan 12-column grid layout, skala tipografi modular, dan font pairing agar teks nyaman dibaca di layar HP maupun laptop.', 15, 2);

    -- Bab 2
    INSERT INTO public.chapters (course_id, title, sort_order)
    VALUES (v_course_id, 'Bab 2: Desain Komponen & Sistem Warna', 2)
    RETURNING id INTO v_ch2_id;

    INSERT INTO public.lessons (chapter_id, title, video_source, video_url, content_text, duration_minutes, sort_order)
    VALUES 
      (v_ch2_id, 'Membuat Komponen Navbar & Tombol Interaktif', 'youtube', 'https://www.youtube.com/watch?v=F_f82GkKqE8', 'Teknik pembuatan komponen reusable dengan auto-layout, varian hover state, dan token warna konsisten.', 18, 1),
      (v_ch2_id, 'Merancang Kartu Metrik Dashboard Pastel', 'youtube', 'https://www.youtube.com/watch?v=1rP_858tc98', 'Tutorial membuat kartu ringkasan status dengan warna pastel yang lembut, ikon vektor tajam, dan indikator persentase bulat.', 14, 2);

    -- Bab 3
    INSERT INTO public.chapters (course_id, title, sort_order)
    VALUES (v_course_id, 'Bab 3: Implementasi Layout & Responsif', 3)
    RETURNING id INTO v_ch3_id;

    INSERT INTO public.lessons (chapter_id, title, video_source, video_url, content_text, duration_minutes, sort_order)
    VALUES 
      (v_ch3_id, 'Layouting 3-Kolom Anti-AI & Spasi Bersih', 'youtube', 'https://www.youtube.com/watch?v=7uK06h_R98k', 'Menerapkan hierarki visual buatan desainer manusia: spasi lapang, sudut membulat modern, dan sidebar ergonomis.', 20, 1);
  END IF;
END $$;

-- Kursus 2: Html Basics
INSERT INTO public.courses (code, title, slug, category, description, thumbnail)
VALUES (
  'CRS-202611-002',
  'Html Basics & Struktur Semantik',
  'html-basics',
  'Frontend Fundamental',
  'Kuasai pondasi web modern menggunakan tag semantik HTML5 yang ramah SEO dan mudah dipahami mesin pencari.',
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80'
)
ON CONFLICT (code) DO NOTHING;

-- Bab & Materi untuk Kursus 2
DO $$
DECLARE
  v_course_id INT;
  v_ch1_id INT;
BEGIN
  SELECT id INTO v_course_id FROM public.courses WHERE code = 'CRS-202611-002';
  IF v_course_id IS NOT NULL THEN
    INSERT INTO public.chapters (course_id, title, sort_order)
    VALUES (v_course_id, 'Bab 1: Tag Esensial HTML5', 1)
    RETURNING id INTO v_ch1_id;

    INSERT INTO public.lessons (chapter_id, title, video_source, video_url, content_text, duration_minutes, sort_order)
    VALUES 
      (v_ch1_id, 'Struktur Dasar Dokumen HTML5', 'youtube', 'https://www.youtube.com/watch?v=MDLn5-zSQQI', 'Memahami tag <!DOCTYPE html>, <html>, <head>, dan <body> serta cara kerja peramban membaca berkas.', 10, 1),
      (v_ch1_id, 'Formulir Interaktif & Validasi Input', 'youtube', 'https://www.youtube.com/watch?v=fNcJuPIZ2WE', 'Belajar membuat formulir input, tombol kirim, dropdown, dan tipe data input terkini.', 15, 2);
  END IF;
END $$;
