const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let supabase = null;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[Storage] Terhubung ke Supabase Storage:', supabaseUrl);
  } catch (err) {
    console.error('[Storage] Gagal inisialisasi Supabase client:', err.message);
  }
}

/**
 * Unggah file ke Supabase Storage (atau fallback lokal jika belum ada Supabase)
 * @param {Object} file - Express Multer file object
 * @param {string} folder - 'avatars' atau 'thumbnails'
 * @returns {Promise<string>} URL publik berkas
 */
async function uploadToStorage(file, folder = 'avatars') {
  if (!file) return null;

  const ext = path.extname(file.originalname).toLowerCase() || '.png';
  const fileName = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;

  // 1. Prioritas: Unggah ke Supabase Storage bucket 'kyzoo-assets'
  if (supabase) {
    try {
      const fileBuffer = file.buffer || (file.path ? fs.readFileSync(file.path) : null);
      if (!fileBuffer) {
        throw new Error('Buffer file tidak ditemukan');
      }

      const { data, error } = await supabase.storage
        .from('kyzoo-assets')
        .upload(fileName, fileBuffer, {
          contentType: file.mimetype || 'image/png',
          upsert: true
        });

      if (error) {
        console.error('[Supabase Storage Upload Error]', error);
        throw error;
      }

      const { data: urlData } = supabase.storage
        .from('kyzoo-assets')
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (supabaseErr) {
      console.warn('[Storage] Fallback lokal karena Supabase upload gagal:', supabaseErr.message);
    }
  }

  // 2. Fallback Lokal (untuk pengembangan offline)
  try {
    const localDir = path.join(__dirname, '../public/uploads', folder);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    const localFileName = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    const targetPath = path.join(localDir, localFileName);

    if (file.buffer) {
      fs.writeFileSync(targetPath, file.buffer);
    } else if (file.path) {
      fs.copyFileSync(file.path, targetPath);
    }

    return `/uploads/${folder}/${localFileName}`;
  } catch (localErr) {
    console.error('[Storage] Gagal menyimpan file lokal:', localErr.message);
    // Kembalikan placeholder jika gagal
    return folder === 'avatars' 
      ? 'https://api.dicebear.com/7.x/bottts/svg?seed=user'
      : 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80';
  }
}

module.exports = {
  uploadToStorage,
  getSupabaseClient: () => supabase
};
