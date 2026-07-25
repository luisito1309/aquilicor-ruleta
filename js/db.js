// ============================================================
// js/db.js — Supabase Database Client & Helper Functions
// ============================================================
// Contiene la validación atómica estricta de QR de 1 solo uso.
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
 * Retorna el objeto token o null si no existe.
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
 * Suscripción en tiempo real al estado de un token específico.
 * Llama a callback(data) cada vez que el token cambie en Supabase.
 * Retorna función para desuscribirse.
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

/* ── Participaciones & Validación Estricta de 1 Solo Uso ───── */

/**
 * REGISTRO ESTRICTO DE 1 SOLO USO (Capa 2 - Transacción Atómica):
 * 1. Intenta cambiar el estado del token de 'ACTIVO' -> 'USADO' condicionado a estado='ACTIVO'.
 * 2. Si no actualiza ninguna fila (alguien más lo usó o no existe), lanza error 'TOKEN_ALREADY_USED_OR_INVALID'.
 * 3. Si la actualización tuvo éxito (afectó 1 fila), guarda la participación en 'participaciones'.
 */
async function registrarParticipacionConTokenEstricto(data) {
  const client = getDB();
  const nowIso = new Date().toISOString();

  // Paso 1: Consumir token atómicamente si y solo si estado === 'ACTIVO'
  const { data: updatedTokens, error: updateError } = await client
    .from(APP_CONFIG.tables.tokens)
    .update({
      estado: 'USADO',
      fecha_uso: nowIso
    })
    .eq('id', data.tokenId)
    .eq('estado', 'ACTIVO')
    .select();

  if (updateError) {
    console.error('Error al actualizar estado del token:', updateError);
    throw new Error('TOKEN_UPDATE_FAILED');
  }

  // Si no se actualizó ninguna fila, el token ya fue consumido o es inválido
  if (!updatedTokens || updatedTokens.length === 0) {
    throw new Error('TOKEN_ALREADY_USED_OR_INVALID');
  }

  // Paso 2: Token consumido con éxito por esta solicitud -> Insertar participación
  const { data: result, error: insertError } = await client
    .from(APP_CONFIG.tables.participaciones)
    .insert([{
      nombre:         data.nombre.trim(),
      ci:             data.ci.trim(),
      telefono:       data.telefono ? data.telefono.trim() : '',
      token_id:       data.tokenId,
      fecha_registro: nowIso
    }])
    .select();

  if (insertError) {
    console.error('Error al guardar la participación:', insertError);

    // Revertir el token a 'ACTIVO' si fallara el guardado de la participación
    await client
      .from(APP_CONFIG.tables.tokens)
      .update({ estado: 'ACTIVO', fecha_uso: null })
      .eq('id', data.tokenId);

    throw new Error('PARTICIPATION_INSERT_FAILED');
  }

  return result;
}

/**
 * Obtiene participaciones dentro del rango de fechas activo para la ruleta.
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

/* ── UI Utilities ───────────────────────────────────────────── */

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
