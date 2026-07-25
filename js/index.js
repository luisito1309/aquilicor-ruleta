// ============================================================
// js/index.js — Landing Page Logic
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Footer year
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Scroll reveal animations
  initRevealOnScroll();

  // Generate floating particles
  initParticles();

  // Nav scroll effect
  initNavScroll();

  // Update sorteo badge dynamically from Firestore if Firebase is configured
  updateSorteoBadge();
});

/* ── Floating Particles ───────────────────────────────────── */
function initParticles() {
  const container = document.getElementById('hero-particles');
  if (!container) return;

  const items = ['🍾', '🥂', '✨', '⭐', '🎰', '🎲', '💎', '🌟'];
  const count = window.innerWidth < 600 ? 8 : 15;

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'particle';

    const isEmoji = Math.random() > 0.4;
    const size = 8 + Math.random() * 14;

    if (isEmoji) {
      el.style.cssText = `
        left: ${Math.random() * 100}%;
        font-size: ${14 + Math.random() * 18}px;
        animation-duration: ${8 + Math.random() * 12}s;
        animation-delay: ${Math.random() * 8}s;
        opacity: 0;
      `;
      el.textContent = items[Math.floor(Math.random() * items.length)];
      el.style.borderRadius = '0';
      el.style.background = 'transparent';
    } else {
      const colors = ['rgba(212,168,67,0.4)', 'rgba(240,192,64,0.3)', 'rgba(232,146,26,0.4)'];
      el.style.cssText = `
        left: ${Math.random() * 100}%;
        width: ${size}px;
        height: ${size}px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        animation-duration: ${10 + Math.random() * 15}s;
        animation-delay: ${Math.random() * 10}s;
        opacity: 0;
        filter: blur(${Math.random() > 0.5 ? '1px' : '0px'});
      `;
    }

    container.appendChild(el);
  }
}

/* ── Nav Scroll Effect ────────────────────────────────────── */
function initNavScroll() {
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 60) {
      nav.style.background = 'rgba(8,8,16,0.98)';
      nav.style.boxShadow = '0 4px 30px rgba(0,0,0,0.5)';
    } else {
      nav.style.background = 'rgba(8,8,16,0.85)';
      nav.style.boxShadow = 'none';
    }
  }, { passive: true });
}

/* ── Update Sorteo Badge ──────────────────────────────────── */
async function updateSorteoBadge() {
  if (!APP_CONFIG.supabaseUrl) return;

  try {
    const config = await obtenerConfigSorteo();
    if (!config) return;

    const now = new Date();
    const badge = document.querySelector('.hero__badge');
    if (!badge) return;

    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    if (config.fechaFin && now <= config.fechaFin) {
      const mes = `${meses[config.fechaFin.getMonth()]} ${config.fechaFin.getFullYear()}`;
      badge.innerHTML = `<span class="dot dot--success"></span> Sorteo Activo — ${mes}`;
    } else {
      badge.innerHTML = `<span class="dot dot--danger"></span> Próximo sorteo próximamente`;
      badge.style.color = 'var(--text-muted)';
    }
  } catch (e) {
    console.info('Configura js/config.js para activar datos en tiempo real.');
  }
}
