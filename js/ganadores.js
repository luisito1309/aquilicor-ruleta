// ============================================================
// js/ganadores.js — Winners Page Logic
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Footer year
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  cargarHistorialGanadores();
});

/**
 * Enmascara el CI del ganador para proteger la privacidad.
 * Ej: "1234567" -> "1234XXX"  o "76543210" -> "7654XXXX"
 */
function maskCI(ci) {
  if (!ci) return 'CI no disponible';
  const clean = ci.toString().trim();
  if (clean.length <= 4) return clean + '***';
  const visible = clean.substring(0, Math.ceil(clean.length / 2));
  const masked = 'X'.repeat(clean.length - visible.length);
  return `${visible}${masked}`;
}

async function cargarHistorialGanadores() {
  const loadingEl = document.getElementById('winners-loading');
  const emptyEl   = document.getElementById('winners-empty');
  const gridEl    = document.getElementById('winners-grid');

  try {
    const ganadores = await obtenerGanadores();

    loadingEl.classList.add('hide');

    if (!ganadores || ganadores.length === 0) {
      emptyEl.classList.remove('hide');
      return;
    }

    // Populate grid
    gridEl.innerHTML = '';
    
    ganadores.forEach(g => {
      const card = document.createElement('div');
      card.className = 'card card--glass winner-card reveal';

      const premioText = g.premio || APP_CONFIG.premio;
      const maskedCiText = maskCI(g.ci);
      const mesText = g.mes || 'Sorteo Mensual';

      card.innerHTML = `
        <div>
          <div class="winner-card__month-badge">
            📅 ${mesText}
          </div>
          <div class="winner-card__trophy">🏆</div>
          <h3 class="winner-card__name">${g.nombre}</h3>
          <p class="winner-card__ci">CI: ${maskedCiText}</p>
        </div>
        <div class="winner-card__prize">
          🎁 <span>${premioText}</span>
        </div>
      `;

      gridEl.appendChild(card);
    });

    gridEl.classList.remove('hide');

    // Trigger reveal animations
    initRevealOnScroll();

  } catch (error) {
    console.error('Error cargando historial de ganadores:', error);
    loadingEl.classList.add('hide');
    emptyEl.classList.remove('hide');
  }
}
