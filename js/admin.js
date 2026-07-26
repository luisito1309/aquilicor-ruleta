// ============================================================
// js/admin.js — Owner Admin Panel Logic
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initAdminAuth();
});

// Global state
let currentTokenId = null;
let currentTokenUnsub = null;
let currentParticipants = [];
let activeConfig = null;
let currentWinner = null;
let qrCodeInstance = null;

/* ── 1. Auth Gate ─────────────────────────────────────────── */
function initAdminAuth() {
  const authModal = document.getElementById('admin-auth-modal');
  const authForm  = document.getElementById('admin-auth-form');
  const passwordInput = document.getElementById('admin-password');
  const authError = document.getElementById('auth-error');
  const dashboard = document.getElementById('admin-dashboard');
  const btnLogout = document.getElementById('btn-logout');

  // Check session storage
  if (sessionStorage.getItem('ruleta_admin_auth') === 'true') {
    authModal.classList.remove('is-open');
    dashboard.classList.remove('hide');
    initAdminDashboard();
  }

  authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    authError.style.display = 'none';

    if (passwordInput.value === APP_CONFIG.adminPassword) {
      sessionStorage.setItem('ruleta_admin_auth', 'true');
      authModal.classList.remove('is-open');
      dashboard.classList.remove('hide');
      initAdminDashboard();
    } else {
      authError.style.display = 'block';
      passwordInput.value = '';
      passwordInput.focus();
    }
  });

  btnLogout.addEventListener('click', () => {
    sessionStorage.removeItem('ruleta_admin_auth');
    window.location.reload();
  });
}

/* ── 2. Dashboard Init ────────────────────────────────────── */
async function initAdminDashboard() {
  // Init QR buttons listeners
  document.getElementById('btn-generate-qr').addEventListener('click', () => {
    generarNuevoQR();
  });
  document.getElementById('btn-download-promo-qr').addEventListener('click', descargarQRFijoPNG);

  // Init Config Form listener
  document.getElementById('sorteo-config-form').addEventListener('submit', handleSaveConfig);

  // Refresh participants button
  document.getElementById('btn-refresh-participants').addEventListener('click', cargarParticipantes);

  // Spin Wheel button
  document.getElementById('btn-spin-wheel').addEventListener('click', girarRuleta);

  // Winner Modal buttons
  document.getElementById('btn-close-winner-modal').addEventListener('click', () => {
    document.getElementById('winner-modal').classList.remove('is-open');
  });
  document.getElementById('btn-publish-winner').addEventListener('click', handlePublishWinner);

  // Load Initial Data
  await cargarConfiguracion();
  await generarNuevoQR();
  generarQRFijoPromocional();
  initRouletteCanvas();
}

/* ── 3. QR Code Generator & Realtime Refresh ──────────────── */
async function generarNuevoQR() {
  const btnGenerate = document.getElementById('btn-generate-qr');
  const qrLoading = document.getElementById('qr-loading');
  const qrcodeContainer = document.getElementById('qrcode');
  const qrUrlDisplay = document.getElementById('qr-url-display');
  const badgeText = document.getElementById('qr-status-text');
  const badgeContainer = document.getElementById('qr-status-badge');

  // Desactivar botón para evitar ejecuciones simultáneas
  if (btnGenerate) btnGenerate.disabled = true;

  // Cancelar suscripción previa del token antiguo
  if (currentTokenUnsub) {
    currentTokenUnsub();
    currentTokenUnsub = null;
  }

  // Limpiar vista completamente
  qrcodeContainer.innerHTML = '';
  qrUrlDisplay.textContent = 'Generando nuevo código QR...';
  qrLoading.classList.remove('hide');

  try {
    // 1. Crear entrada limpia con estado 'ACTIVO' en Supabase
    currentTokenId = await crearToken();

    // 2. Construir la URL del QR
    const baseUrl = (APP_CONFIG.domain && !APP_CONFIG.domain.includes('YOUR-DOMAIN'))
      ? APP_CONFIG.domain
      : window.location.origin + window.location.pathname.replace('admin.html', '');
    
    const targetUrl = `${baseUrl.replace(/\/$/, '')}/registro.html?token=${currentTokenId}`;

    qrLoading.classList.add('hide');

    // 3. Renderizar el nuevo código QR en pantalla de caja
    qrCodeInstance = new QRCode(qrcodeContainer, {
      text: targetUrl,
      width: 200,
      height: 200,
      colorDark: '#080810',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });

    qrUrlDisplay.textContent = targetUrl;
    badgeText.textContent = 'QR ACTIVO (1 SOLO USO)';
    badgeContainer.className = 'badge badge--active';

    if (btnGenerate) btnGenerate.disabled = false;

    // 4. Suscripción en tiempo real: auto-regenerar tan pronto como un cliente use este token
    currentTokenUnsub = onTokenChange(currentTokenId, (tokenData) => {
      if (!tokenData) return;

      if (tokenData.estado === 'USADO') {
        badgeText.textContent = 'QR USADO';
        badgeContainer.className = 'badge badge--used';
        
        showToast('🎉 ¡Un cliente acaba de registrar su compra! Generando nuevo QR en 1.5s...', 'success');

        // Regenerar automáticamente un nuevo QR para la caja
        setTimeout(() => {
          generarNuevoQR();
          cargarParticipantes(); // Actualizar contador de tickets
        }, 1500);
      }
    });

  } catch (error) {
    console.error('Error al generar nuevo QR:', error);
    qrLoading.classList.add('hide');
    qrUrlDisplay.textContent = 'Error al generar QR. Inténtalo de nuevo.';
    if (btnGenerate) btnGenerate.disabled = false;
    showToast('Error al crear nuevo QR en Supabase.', 'danger');
  }
}

/* ── 3b. QR Fijo Promocional (Multiuso / Impresión) ────────── */
let promoQrCodeInstance = null;
let currentPromoTargetUrl = '';

function generarQRFijoPromocional() {
  const container = document.getElementById('qrcode-promo');
  const displayUrl = document.getElementById('qr-promo-url-display');
  if (!container || !displayUrl) return;

  container.innerHTML = '';

  const baseUrl = (APP_CONFIG.domain && !APP_CONFIG.domain.includes('YOUR-DOMAIN'))
    ? APP_CONFIG.domain
    : window.location.origin + window.location.pathname.replace('admin.html', '');

  currentPromoTargetUrl = `${baseUrl.replace(/\/$/, '')}/registro.html?token=PROMO_SORTEO`;

  promoQrCodeInstance = new QRCode(container, {
    text: currentPromoTargetUrl,
    width: 200,
    height: 200,
    colorDark: '#080810',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });

  displayUrl.textContent = currentPromoTargetUrl;
}

function descargarQRFijoPNG() {
  const container = document.getElementById('qrcode-promo');
  if (!container) return;

  const rawCanvas = container.querySelector('canvas');
  const rawImg = container.querySelector('img');

  let qrImageSource = null;
  if (rawCanvas) {
    qrImageSource = rawCanvas;
  } else if (rawImg && rawImg.src) {
    qrImageSource = rawImg;
  }

  if (!qrImageSource) {
    showToast('El código QR promocional no está listo aún.', 'warning');
    return;
  }

  // Crear canvas offscreen de alta resolución (600x740 px) para impresión profesional
  const offscreen = document.createElement('canvas');
  offscreen.width = 600;
  offscreen.height = 740;
  const ctx = offscreen.getContext('2d');

  // Fondo oscuro elegante
  ctx.fillStyle = '#080810';
  ctx.fillRect(0, 0, 600, 740);

  // Borde dorado de lujo
  ctx.strokeStyle = '#d4a843';
  ctx.lineWidth = 10;
  ctx.strokeRect(16, 16, 568, 708);

  // Título de Marca
  ctx.fillStyle = '#f0c040';
  ctx.font = '900 30px "Playfair Display", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('🍾 RULETA AQUI LICOR 🍾', 300, 75);

  // Subtítulo
  ctx.fillStyle = '#a8a8c8';
  ctx.font = '600 16px Inter, sans-serif';
  ctx.fillText('ESCANEA PARA REGISTRARTE EN EL SORTEO', 300, 110);

  // Tarjeta Blanca para el QR
  ctx.fillStyle = '#ffffff';
  if (ctx.roundRect) {
    ctx.roundRect(110, 135, 380, 380, 20);
    ctx.fill();
  } else {
    ctx.fillRect(110, 135, 380, 380);
  }

  // Dibujar el código QR centrado (340x340 px)
  ctx.drawImage(qrImageSource, 130, 155, 340, 340);

  // Leyenda Promocional
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.fillText('¡Cada compra es una oportunidad de ganar!', 300, 560);

  ctx.fillStyle = '#eeeeef';
  ctx.font = '14px Inter, sans-serif';
  ctx.fillText('Pide tu QR de registro único en caja tras tu compra.', 300, 595);

  ctx.fillStyle = '#6868a8';
  ctx.font = '12px Inter, sans-serif';
  ctx.fillText('Venta y consumo responsable de bebidas alcohólicas (+18)', 300, 675);

  // Descarga del archivo PNG
  const dataUrl = offscreen.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = 'QR_Promocional_RULETA_AQUI_LICOR.png';
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('📥 ¡QR Promocional descargado en PNG de alta resolución!', 'success');
}

/* ── 4. Sorteo Config & Tickets ────────────────────────────── */
async function cargarConfiguracion() {
  const inicioInput = document.getElementById('fecha-inicio');
  const finInput    = document.getElementById('fecha-fin');
  const premioInput = document.getElementById('premio-nombre');

  try {
    activeConfig = await obtenerConfigSorteo();

    if (activeConfig && activeConfig.fechaInicio && activeConfig.fechaFin) {
      inicioInput.value = activeConfig.fechaInicio.toISOString().split('T')[0];
      finInput.value    = activeConfig.fechaFin.toISOString().split('T')[0];
      premioInput.value = activeConfig.premio || APP_CONFIG.premio;
    } else {
      // Default: current month
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      inicioInput.value = firstDay.toISOString().split('T')[0];
      finInput.value    = lastDay.toISOString().split('T')[0];
      premioInput.value = APP_CONFIG.premio;

      // Save defaults
      await guardarConfigSorteo({
        fechaInicio: inicioInput.value,
        fechaFin: finInput.value,
        premio: premioInput.value
      });
      activeConfig = {
        fechaInicio: firstDay,
        fechaFin: lastDay,
        premio: APP_CONFIG.premio
      };
    }

    await cargarParticipantes();

  } catch (error) {
    console.error('Error al cargar configuración:', error);
  }
}

async function handleSaveConfig(e) {
  e.preventDefault();
  const fechaInicio = document.getElementById('fecha-inicio').value;
  const fechaFin    = document.getElementById('fecha-fin').value;
  const premio      = document.getElementById('premio-nombre').value;

  if (!fechaInicio || !fechaFin) {
    showToast('Selecciona la fecha de inicio y fin del sorteo.', 'warning');
    return;
  }

  try {
    await guardarConfigSorteo({ fechaInicio, fechaFin, premio });
    showToast('Configuración del sorteo guardada correctamente.', 'success');
    activeConfig = {
      fechaInicio: new Date(fechaInicio),
      fechaFin: new Date(fechaFin + 'T23:59:59'),
      premio
    };
    await cargarParticipantes();
  } catch (error) {
    console.error('Error guardando config:', error);
    showToast('Error al guardar la configuración.', 'danger');
  }
}

async function cargarParticipantes() {
  const countEl = document.getElementById('ticket-count');
  
  if (!activeConfig || !activeConfig.fechaInicio || !activeConfig.fechaFin) return;

  try {
    currentParticipants = await obtenerParticipaciones(activeConfig.fechaInicio, activeConfig.fechaFin);
    countEl.textContent = currentParticipants.length;
    renderRouletteWheel();
  } catch (error) {
    console.error('Error al obtener participantes:', error);
    currentParticipants = [];
    countEl.textContent = '0';
    renderRouletteWheel();
  }
}

/* ── 5. HTML5 Canvas Interactive Roulette ─────────────────── */
let wheelRotation = 0;
let isSpinning = false;

function initRouletteCanvas() {
  renderRouletteWheel();
}

function renderRouletteWheel() {
  const canvas = document.getElementById('roulette-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = cx - 10;

  ctx.clearRect(0, 0, width, height);

  // List of slices to display
  let slices = currentParticipants.map(p => p.nombre);
  if (slices.length === 0) {
    slices = ['Sin tickets registrados aún', 'RULETA AQUI LICOR', 'Esperando participantes...', '¡Compra y participa!'];
  }

  const numSlices = slices.length;
  const sliceAngle = (2 * Math.PI) / numSlices;

  // Premium color palette for roulette slices
  const colors = [
    '#d4a843', '#1a1a38', '#e8921a', '#12122a', 
    '#f0c040', '#1f1f45', '#b8902a', '#252550'
  ];

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(wheelRotation);

  // Draw slices
  for (let i = 0; i < numSlices; i++) {
    const angle = i * sliceAngle;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, angle, angle + sliceAngle);
    ctx.closePath();

    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#080810';
    ctx.stroke();

    // Draw text inside slice
    ctx.save();
    ctx.rotate(angle + sliceAngle / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = (colors[i % colors.length] === '#d4a843' || colors[i % colors.length] === '#f0c040') ? '#080810' : '#eeeeee';
    ctx.font = 'bold 13px Inter, sans-serif';
    
    // Truncate long names
    let label = slices[i];
    if (label.length > 20) label = label.substring(0, 18) + '...';
    
    ctx.fillText(label, radius - 20, 5);
    ctx.restore();
  }

  // Draw central hub
  ctx.beginPath();
  ctx.arc(0, 0, 45, 0, 2 * Math.PI);
  ctx.fillStyle = '#080810';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#d4a843';
  ctx.stroke();

  ctx.fillStyle = '#f0c040';
  ctx.font = '24px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🍾', 0, 0);

  ctx.restore();
}

/* Spin animation */
function girarRuleta() {
  if (isSpinning) return;

  if (currentParticipants.length === 0) {
    showToast('No hay tickets registrados en el rango de fechas activo para realizar el sorteo.', 'warning');
    return;
  }

  isSpinning = true;
  const btnSpin = document.getElementById('btn-spin-wheel');
  btnSpin.disabled = true;
  btnSpin.textContent = '🎰 GIRANDO...';

  // Pick random winner index
  const winnerIndex = Math.floor(Math.random() * currentParticipants.length);
  currentWinner = currentParticipants[winnerIndex];

  const numSlices = currentParticipants.length;
  const sliceAngle = (2 * Math.PI) / numSlices;

  // Calculate target rotation to stop under pointer (top = -PI/2)
  // Target angle for winner slice center = winnerIndex * sliceAngle + sliceAngle / 2
  const targetSliceAngle = winnerIndex * sliceAngle + sliceAngle / 2;
  
  // Extra full rotations (5 to 8 full spins for drama)
  const extraSpins = 6 * (2 * Math.PI);
  
  // Pointer is at -PI/2 (top). So final rotation angle:
  const finalAngle = extraSpins + (3 * Math.PI / 2 - targetSliceAngle);

  const duration = 6000; // 6 seconds
  const startRotation = wheelRotation % (2 * Math.PI);
  const totalRotationNeeded = finalAngle - startRotation;

  let startTime = null;

  function animate(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Cubic ease-out formula for realistic friction slowdown
    const easeOut = 1 - Math.pow(1 - progress, 4);

    wheelRotation = startRotation + totalRotationNeeded * easeOut;
    renderRouletteWheel();

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      // Finished spinning!
      isSpinning = false;
      btnSpin.disabled = false;
      btnSpin.textContent = '🚀 ¡EMPEZAR SORTEO!';

      // Show winner modal
      mostrarModalGanador(currentWinner);
    }
  }

  requestAnimationFrame(animate);
}

/* ── 6. Winner Modal & Publishing ──────────────────────────── */
function mostrarModalGanador(winner) {
  document.getElementById('winner-name').textContent = winner.nombre;
  document.getElementById('winner-ci').textContent = winner.ci;
  
  const phoneContainer = document.getElementById('winner-phone-container');
  const phoneEl = document.getElementById('winner-phone');
  if (winner.telefono) {
    phoneEl.textContent = winner.telefono;
    phoneContainer.style.display = 'block';
  } else {
    phoneContainer.style.display = 'none';
  }

  document.getElementById('winner-modal').classList.add('is-open');
  launchConfetti();
}

async function handlePublishWinner() {
  if (!currentWinner) return;

  const btnPublish = document.getElementById('btn-publish-winner');
  btnPublish.disabled = true;

  try {
    await guardarGanador({
      nombre:   currentWinner.nombre,
      ci:       currentWinner.ci,
      telefono: currentWinner.telefono,
      premio:   activeConfig ? activeConfig.premio : APP_CONFIG.premio
    });

    showToast('🏆 ¡Ganador guardado y publicado en el historial público!', 'success');
    document.getElementById('winner-modal').classList.remove('is-open');
    btnPublish.disabled = false;

  } catch (error) {
    console.error('Error al guardar ganador:', error);
    showToast('Ocurrió un error al guardar el ganador.', 'danger');
    btnPublish.disabled = false;
  }
}
