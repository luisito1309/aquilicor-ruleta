// ============================================================
// js/registro.js — Customer Registration & Dual-Token Logic
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initRegistrationFlow();
});

let currentTokenId = null;
let realtimeTokenUnsub = null;

async function initRegistrationFlow() {
  const urlParams = new URLSearchParams(window.location.search);
  const rawToken = urlParams.get('token');

  const stateLoading = document.getElementById('state-loading');
  const stateBlocked = document.getElementById('state-blocked');
  const stateForm    = document.getElementById('state-form');
  const stateSuccess = document.getElementById('state-success');

  function showState(el) {
    [stateLoading, stateBlocked, stateForm, stateSuccess].forEach(s => s.classList.add('hide'));
    el.classList.remove('hide');
  }

  // 1. SI ES QR FIJO PROMOCIONAL (sin token o token PROMO) -> ACCESO LIBRE PARA TODOS SIN RESTRICCIONES
  const isPromo = !rawToken || rawToken.toUpperCase().startsWith('PROMO');
  currentTokenId = isPromo ? 'PROMO_LIBRE' : rawToken;

  if (isPromo) {
    // Formulario habilitado siempre para todos los clientes (Multiuso e Ilimitado)
    showState(stateForm);
    setupFormValidation(showState, stateBlocked, stateSuccess);
    return;
  }

  // 2. SI ES QR DINÁMICO DE CAJA -> Validar estado de 1 solo uso en Supabase
  try {
    const tokenData = await obtenerToken(currentTokenId);

    if (!tokenData || tokenData.estado !== 'ACTIVO') {
      // Token de caja consumido o inválido -> Bloquear
      showState(stateBlocked);
      return;
    }

    // Token de caja ACTIVO -> Habilitar Formulario
    showState(stateForm);
    setupFormValidation(showState, stateBlocked, stateSuccess);

    // Escuchador en tiempo real si el token de caja es usado por otro dispositivo
    realtimeTokenUnsub = onTokenChange(currentTokenId, (updatedToken) => {
      if (updatedToken && updatedToken.estado !== 'ACTIVO') {
        showState(stateBlocked);
        showToast('Este código QR de caja acaba de ser utilizado por otro dispositivo.', 'warning');
      }
    });

  } catch (error) {
    console.error('Error al validar token de caja:', error);
    showToast('Error de conexión al verificar el código QR.', 'danger');
    showState(stateBlocked);
  }
}

function setupFormValidation(showState, stateBlocked, stateSuccess) {
  const form = document.getElementById('registro-form');
  const nombreInput = document.getElementById('nombre');
  const ciInput = document.getElementById('ci');
  const ageCheck = document.getElementById('age-check');
  const btnSubmit = document.getElementById('btn-submit');
  const btnText = btnSubmit.querySelector('.btn-text');
  const btnSpinner = btnSubmit.querySelector('.btn-spinner');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Limpiar errores previos
    document.querySelectorAll('.form-group').forEach(g => g.classList.remove('has-error'));

    let isValid = true;

    if (!nombreInput.value.trim()) {
      document.getElementById('group-nombre').classList.add('has-error');
      isValid = false;
    }

    if (!ciInput.value.trim()) {
      document.getElementById('group-ci').classList.add('has-error');
      isValid = false;
    }

    if (!ageCheck.checked) {
      document.getElementById('group-age').classList.add('has-error');
      isValid = false;
    }

    if (!isValid) return;

    // Desactivar botón para prevenir envíos duplicados por clic rápido
    btnSubmit.disabled = true;
    btnText.classList.add('hide');
    btnSpinner.classList.remove('hide');

    try {
      // Guardar participación (si es PROMO_LIBRE no restringe; si es token de caja lo invalida)
      await registrarParticipacionConTokenEstricto({
        nombre: nombreInput.value.trim(),
        ci: ciInput.value.trim(),
        telefono: document.getElementById('telefono').value.trim(),
        tokenId: currentTokenId
      });

      if (realtimeTokenUnsub) realtimeTokenUnsub();

      // Registro Exitoso
      showState(stateSuccess);
      launchConfetti();

    } catch (error) {
      console.error('Error al procesar registro:', error);

      if (error.message === 'TOKEN_ALREADY_USED_OR_INVALID') {
        if (realtimeTokenUnsub) realtimeTokenUnsub();
        showState(stateBlocked);
        showToast('Este código QR de caja ya fue utilizado previamente. Solicita un nuevo QR en caja.', 'danger');
      } else {
        showToast('Ocurrió un error al guardar tu registro. Inténtalo nuevamente.', 'danger');
        btnSubmit.disabled = false;
        btnText.classList.remove('hide');
        btnSpinner.classList.add('hide');
      }
    }
  });
}
