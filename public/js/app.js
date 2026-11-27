// Kyzoo LMS - Client Side Script

document.addEventListener('DOMContentLoaded', () => {
  // 1. Mobile Sidebar Toggle
  const openSidebarBtn = document.getElementById('openSidebarBtn');
  const closeSidebarBtn = document.getElementById('closeSidebarBtn');
  const sidebarMenu = document.getElementById('sidebarMenu');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  function openSidebar() {
    if (sidebarMenu) sidebarMenu.classList.remove('-translate-x-full');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('hidden');
  }

  function closeSidebar() {
    if (sidebarMenu) sidebarMenu.classList.add('-translate-x-full');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('hidden');
  }

  if (openSidebarBtn) openSidebarBtn.addEventListener('click', openSidebar);
  if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

  // Auto close sidebar saat link diklik pada layar mobile
  if (sidebarMenu) {
    const navLinks = sidebarMenu.querySelectorAll('a');
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth < 768) {
          closeSidebar();
        }
      });
    });
  }

  // 2. Shortcut Keyboard Ctrl + K untuk Fokus ke Search Bar (Persis Gambar 2)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      const heroSearch = document.getElementById('heroSearchInput');
      if (heroSearch) {
        heroSearch.focus();
        heroSearch.select();
      }
    }
  });

  // 3. Sistem Tema Interaktif & Dinamis (Dark/Light Mode + Aksen Warna Kyzoo)
  initInteractiveThemeSystem();

  // 4. Sistem Deteksi Inaktivitas & Otomatis Logout (10 Menit Tanpa Pergerakan)
  initInactivityTimer();
});

// Implementasi Sistem Tema Dinamis (Warna Aksen Kyzoo)
function initInteractiveThemeSystem() {
  const dropdownBtn = document.getElementById('themeDropdownBtn');
  const dropdownMenu = document.getElementById('themeDropdownMenu');
  const activeAccentDot = document.getElementById('activeAccentDot');
  const accentBtns = document.querySelectorAll('.accent-btn');

  // Pastikan Mode Gelap Dinonaktifkan Permanen
  document.documentElement.classList.remove('dark');
  localStorage.removeItem('kyzoo_theme_mode');

  const accentColors = {
    violet: '#6c5dd3',
    ocean: '#0284c7',
    emerald: '#10b981',
    coral: '#f97316'
  };

  const accentNames = {
    violet: 'Kyzoo Violet 🟣',
    ocean: 'Ocean Blue 🔵',
    emerald: 'Mint Emerald 🟢',
    coral: 'Sunset Coral 🟠'
  };

  // Toggle Dropdown
  if (dropdownBtn && dropdownMenu) {
    dropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!dropdownMenu.contains(e.target) && !dropdownBtn.contains(e.target)) {
        dropdownMenu.classList.add('hidden');
      }
    });
  }

  // Fungsi Penerapan Warna Aksen
  function applyAccentColor(accent, notify = false) {
    document.documentElement.setAttribute('data-accent', accent);
    localStorage.setItem('kyzoo_theme_accent', accent);

    if (activeAccentDot && accentColors[accent]) {
      activeAccentDot.style.backgroundColor = accentColors[accent];
    }

    accentBtns.forEach(btn => {
      const btnAccent = btn.getAttribute('data-accent');
      const checkIcon = btn.querySelector('span:first-child');
      if (btnAccent === accent) {
        btn.classList.add('bg-brand-50', 'border-brand-300');
        if (checkIcon) checkIcon.textContent = '✓';
      } else {
        btn.classList.remove('bg-brand-50', 'border-brand-300');
        if (checkIcon) checkIcon.textContent = '';
      }
    });

    if (notify) {
      showToast(`Warna aksen diubah ke ${accentNames[accent] || accent}`);
    }
  }

  // Event Listener Tombol Aksen
  accentBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const accent = btn.getAttribute('data-accent');
      applyAccentColor(accent, true);
    });
  });

  // Sinkronisasi Status Awal dari LocalStorage
  const currentAccent = document.documentElement.getAttribute('data-accent') || 'violet';
  applyAccentColor(currentAccent, false);
}

// 3. Toast Notification Function
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const bgClass = type === 'error' ? 'bg-rose-600' : 'bg-slate-900';
  
  toast.className = `${bgClass} text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 transform transition-all duration-300 translate-y-4 opacity-0 pointer-events-auto`;
  toast.innerHTML = `
    <svg class="w-4 h-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Animasi Masuk
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  });

  // Animasi Keluar setelah 3 detik
  setTimeout(() => {
    toast.classList.add('translate-y-4', 'opacity-0');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

// 4. Sistem Deteksi Inaktivitas & Otomatis Logout (30 Menit Tanpa Pergerakan)
function initInactivityTimer() {
  const isUserLoggedIn = document.body.getAttribute('data-user-logged-in') === 'true';
  if (!isUserLoggedIn) return;

  const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 menit = 1.800.000 ms
  const WARNING_BEFORE_MS = 60 * 1000;        // Peringatan 60 detik sebelum logout (menit ke-29)
  const STORAGE_KEY = 'kyzoo_lms_last_activity';

  const modal = document.getElementById('inactivityModal');
  const modalTitle = document.getElementById('inactivityModalTitle');
  const modalSubtitle = document.getElementById('inactivityModalSubtitle');
  const modalBox = document.getElementById('inactivityModalBox');
  const modalActions = document.getElementById('inactivityModalActions');
  const countdownEl = document.getElementById('inactivityCountdown');
  const btnStayActive = document.getElementById('btnStayActive');

  let lastActivity = Date.now();
  let lastRecordedMovement = Date.now();
  let isLoggingOut = false;

  // Bersihkan stempel aktivitas saat user mengklik Logout manual dan tampilkan notice
  document.querySelectorAll('a[href="/logout"]').forEach(link => {
    link.addEventListener('click', () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
      if (typeof showToast === 'function') {
        showToast('Anda sedang keluar (logout) dari sesi Kyzoo LMS...');
      }
    });
  });

  // Sinkronisasi awal atau buat baru jika belum ada
  try {
    const saved = parseInt(localStorage.getItem(STORAGE_KEY), 10);
    if (saved && !isNaN(saved) && saved <= Date.now()) {
      lastActivity = saved;
    } else {
      localStorage.setItem(STORAGE_KEY, String(lastActivity));
    }
  } catch (e) {}

  // Fungsi saat terdeteksi pergerakan pengguna (mouse, keyboard, touch, scroll)
  function recordUserActivity() {
    if (isLoggingOut) return;
    const now = Date.now();
    // Throttle pembaruan maksimal sekali tiap 1 detik agar hemat resource
    if (now - lastRecordedMovement > 1000) {
      lastRecordedMovement = now;
      lastActivity = now;
      try {
        localStorage.setItem(STORAGE_KEY, String(now));
      } catch (e) {}

      // Jika modal peringatan sedang terbuka dan pengguna bergerak, tutup otomatis
      if (modal && !modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
      }
    }
  }

  // Pantau seluruh bentuk pergerakan & interaksi pengguna
  const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'wheel'];
  activityEvents.forEach(evt => {
    window.addEventListener(evt, recordUserActivity, { passive: true });
  });

  // Tombol "Saya Masih Di Sini"
  if (btnStayActive) {
    btnStayActive.addEventListener('click', () => {
      recordUserActivity();
      if (modal) modal.classList.add('hidden');
      if (typeof showToast === 'function') {
        showToast('Sesi belajar Anda telah diperpanjang 30 menit.');
      }
    });
  }

  // Fungsi pengecekan inaktivitas berkala
  function checkInactivity() {
    if (isLoggingOut) return;

    let currentLast = lastActivity;
    try {
      const stored = parseInt(localStorage.getItem(STORAGE_KEY), 10);
      if (stored && !isNaN(stored)) {
        currentLast = Math.max(lastActivity, stored);
      }
    } catch (e) {}

    const idleTime = Date.now() - currentLast;
    const remainingMs = INACTIVITY_LIMIT_MS - idleTime;

    // 1. Waktu habis (30 menit tanpa pergerakan): Tampilkan notice singkat lalu logout otomatis
    if (remainingMs <= 0) {
      isLoggingOut = true;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}

      if (modal) {
        modal.classList.remove('hidden');
        if (modalTitle) modalTitle.textContent = 'Sesi Berakhir Otomatis (30 Menit)';
        if (modalSubtitle) modalSubtitle.textContent = 'Tidak ada pergerakan terdeteksi selama 30 menit.';
        if (modalBox) {
          modalBox.className = 'p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs text-rose-700 dark:text-rose-300 font-medium';
          modalBox.textContent = 'Demi keamanan akun, Anda sedang dikeluarkan secara otomatis ke halaman login...';
        }
        if (modalActions) modalActions.classList.add('hidden');
      }

      if (typeof showToast === 'function') {
        showToast('Sesi berakhir karena tidak ada pergerakan 30 menit. Logout otomatis...', 'error');
      }

      setTimeout(() => {
        window.location.href = '/logout?reason=inactivity';
      }, 900);
      return;
    }

    // 2. Masuk zona peringatan (sisa <= 60 detik)
    if (remainingMs <= WARNING_BEFORE_MS) {
      if (modal && modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
      }
      if (countdownEl) {
        countdownEl.textContent = Math.max(1, Math.ceil(remainingMs / 1000));
      }
    } else {
      // Masih aktif, pastikan modal tertutup
      if (modal && !modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
      }
    }
  }

  // Interval deteksi setiap 1 detik
  setInterval(checkInactivity, 1000);

  // Jika tab kembali dibuka setelah layar mati/laptop ditutup lebih dari 30 menit
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkInactivity();
    }
  });

  window.addEventListener('focus', checkInactivity);
}
