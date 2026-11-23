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
