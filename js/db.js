// ============================================================
// js/db.js — Supabase Database Client & Helper Functions
// ============================================================
// Depende de: config.js y @supabase/supabase-js (CDN)
// ============================================================

let _supabaseClient = null;

function getDB() {
  if (_supabaseClient) return _supabaseClient;
  if (!window.supabase || !window.supabase.createClient) {
    console.error('El SDK de Supabase no está cargado.');
    return null;
  }
  _supabaseClient = window.supabase.createClient(
    APP_CONFIG.supabaseUrl,
    APP_CONFIG.supabaseKey
  );
  return _supabaseClient;
}

/* ── UUID Generator ────────────────────────────────────────── */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/* ── Token Helpers ─────────────────────────────────────────── */

/**
 * Crea un nuevo token activo en Supabase.
 * Retorna el tokenId generado.
 */
async function crearToken() {
  const client = getDB();
  const tokenId = generateUUID();
  
  const { data, error } = await client
    .from(APP_CONFIG.tables.tokens)
    .insert([{
      id: tokenId,
      estado: 'ACTIVO',
      fecha_creacion: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) {
    console.error('Error al crear token en Supabase:', error);
    throw error;
  }
  return tokenId;
}

/**
 * Lee el estado de un token por su ID.
 * Retorna el objeto o null si no existe.
 */
async function obtenerToken(tokenId) {
  const client = getDB();
  const { data, error } = await client
    .from(APP_CONFIG.tables.tokens)
    .select('*')
    .eq('id', tokenId)
    .maybeSingle();

  if (error) {
    console.error('Error obteniendo token:', error);
    throw error;
  }
  return data;
}

/**
 * Marca un token como USADO.
 */
async function marcarTokenUsado(tokenId) {
  const client = getDB();
  const { data, error } = await client
    .from(APP_CONFIG.tables.tokens)
    .update({
      estado: 'USADO',
      fecha_uso: new Date().toISOString()
    })
    .eq('id', tokenId);

  if (error) {
    console.error('Error al marcar token usado:', error);
    throw error;
  }
}

/**
 * Suscripción en tiempo real al estado de un token usando Supabase Realtime Channels.
 * Llama a callback(data) cada vez que el token cambie.
 * Retorna función para cancelar la suscripción.
 */
function onTokenChange(tokenId, callback) {
  const client = getDB();
  
  const channel = client
    .channel(`public:tokens:id=eq.${tokenId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: APP_CONFIG.tables.tokens,
        filter: `id=eq.${tokenId}`
      },
      (payload) => {
        if (payload.new) {
          callback(payload.new);
        }
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

/* ── Participaciones Helpers ────────────────────────────────── */

/**
 * Registra una nueva participación en Supabase.
 */
async function registrarParticipacion(data) {
  const client = getDB();
  const { data: result, error } = await client
    .from(APP_CONFIG.tables.participaciones)
    .insert([{
      nombre:         data.nombre.trim(),
      ci:             data.ci.trim(),
      telefono:       data.telefono ? data.telefono.trim() : '',
      token_id:       data.tokenId,
      fecha_registro: new Date().toISOString()
    }]);

  if (error) {
    console.error('Error al registrar participacion:', error);
    throw error;
  }
  return result;
}

/**
 * Obtiene participaciones dentro del rango de fechas activo.
 */
async function obtenerParticipaciones(startDate, endDate) {
  const client = getDB();
  const startIso = startDate.toISOString();
  const endIso   = endDate.toISOString();

  const { data, error } = await client
    .from(APP_CONFIG.tables.participaciones)
    .select('*')
    .gte('fecha_registro', startIso)
    .lte('fecha_registro', endIso)
    .order('fecha_registro', { ascending: true });

  if (error) {
    console.error('Error obteniendo participaciones:', error);
    throw error;
  }
  return data || [];
}

/* ── Sorteo Config Helpers ──────────────────────────────────── */

/**
 * Guarda la configuración del sorteo en Supabase.
 */
async function guardarConfigSorteo(config) {
  const client = getDB();
  const fechaInicioIso = new Date(config.fechaInicio).toISOString();
  const fechaFinIso    = new Date(config.fechaFin + 'T23:59:59').toISOString();

  const { data, error } = await client
    .from(APP_CONFIG.tables.config)
    .upsert([{
      id:           'sorteo',
      fecha_inicio: fechaInicioIso,
      fecha_fin:    fechaFinIso,
      premio:       config.premio || APP_CONFIG.premio,
      updated_at:   new Date().toISOString()
    }]);

  if (error) {
    console.error('Error guardando config:', error);
    throw error;
  }
}

/**
 * Lee la configuración del sorteo.
 */
async function obtenerConfigSorteo() {
  const client = getDB();
  const { data, error } = await client
    .from(APP_CONFIG.tables.config)
    .select('*')
    .eq('id', 'sorteo')
    .maybeSingle();

  if (error || !data) return null;

  return {
    fechaInicio: data.fecha_inicio ? new Date(data.fecha_inicio) : null,
    fechaFin:    data.fecha_fin ? new Date(data.fecha_fin) : null,
    premio:      data.premio || APP_CONFIG.premio
  };
}

/* ── Ganadores Helpers ──────────────────────────────────────── */

/**
 * Guarda un ganador en la tabla ganadores.
 */
async function guardarGanador(ganador) {
  const client = getDB();
  const now = new Date();
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mes = `${meses[now.getMonth()]} ${now.getFullYear()}`;

  const { data, error } = await client
    .from(APP_CONFIG.tables.ganadores)
    .insert([{
      nombre:       ganador.nombre,
      ci:           ganador.ci,
      telefono:     ganador.telefono || '',
      mes:          mes,
      premio:       ganador.premio || APP_CONFIG.premio,
      fecha_sorteo: new Date().toISOString()
    }]);

  if (error) {
    console.error('Error al guardar ganador:', error);
    throw error;
  }
}

/**
 * Obtiene la lista de ganadores ordenados desc.
 */
async function obtenerGanadores() {
  const client = getDB();
  const { data, error } = await client
    .from(APP_CONFIG.tables.ganadores)
    .select('*')
    .order('fecha_sorteo', { ascending: false });

  if (error) {
    console.error('Error al obtener ganadores:', error);
    throw error;
  }
  return data || [];
}

/* ── UI Utilities (Toast, Confetti, Reveal) ─────────────────── */

function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: '✅', danger: '❌', warning: '⚠️', info: '💡' };

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span>${icons[type] || '💡'}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(110%)';
    toast.style.transition = 'all 0.35s ease';
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

function launchConfetti() {
  const colors = ['#f0c040', '#d4a843', '#e8921a', '#ffffff', '#ff6b6b', '#4ade80'];
  for (let i = 0; i < 120; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.style.cssText = `
        position: fixed;
        top: -10px;
        left: ${Math.random() * 100}vw;
        width: ${6 + Math.random() * 8}px;
        height: ${6 + Math.random() * 8}px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
        z-index: 9999;
        pointer-events: none;
        animation: confetti-fall ${2 + Math.random() * 2}s ease-in forwards;
      `;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }, Math.random() * 1500);
  }
}

function initRevealOnScroll() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}
