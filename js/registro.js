// ============================================================
// js/registro.js — Customer Registration & Strict Token Logic
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initRegistrationFlow();
});

let currentTokenId = null;
let realtimeTokenUnsub = null;

async function initRegistrationFlow() {
  const urlParams = new URLSearchParams(window.location.search);
  currentTokenId = urlParams.get('token');

  const stateLoading = document.getElementById('state-loading');
  const stateBlocked = document.getElementById('state-blocked');
  const stateForm    = document.getElementById('state-form');
  const stateSuccess = document.getElementById('state-success');

  function showState(el) {
    [stateLoading, stateBlocked, stateForm, stateSuccess].forEach(s => s.classList.add('hide'));
    el.classList.remove('hide');
  }

  // 1. Si no hay token en la URL -> Bloquear inmediatamente
  if (!currentTokenId) {
    showState(stateBlocked);
    return;
  }

  // 2. CAPA 1: Validar token en Supabase al cargar la vista
  try {
    const tokenData = await obtenerToken(currentTokenId);

    if (!tokenData || tokenData.estado !== 'ACTIVO') {
      // Token no existe o su estado ya es 'USADO' / 'EXPIRED' -> Bloquear
      showState(stateBlocked);
      return;
    }

    // Token VÁLIDO y ACTIVO -> Mostrar Formulario
    showState(stateForm);
    setupFormValidation(showState, stateBlocked, stateSuccess);

    // Escuchador en tiempo real: Si alguien más usa este mismo QR mientras la página está abierta
    realtimeTokenUnsub = onTokenChange(currentTokenId, (updatedToken) => {
      if (updatedToken && updatedToken.estado !== 'ACTIVO') {
        showState(stateBlocked);
        showToast('Este código QR acaba de ser utilizado por otro dispositivo.', 'warning');
      }
    });

  } catch (error) {
    console.error('Error al validar token en Capa 1:', error);
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

    // Limpiar errores visuales previos
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

    // Desactivar botón para prevenir doble clic
    btnSubmit.disabled = true;
    btnText.classList.add('hide');
    btnSpinner.classList.remove('hide');

    try {
      // CAPA 2: Ejecución atómica (Consumir token condicionado a estado='ACTIVO' + Insertar participación)
      await registrarParticipacionConTokenEstricto({
        nombre: nombreInput.value.trim(),
        ci: ciInput.value.trim(),
        telefono: document.getElementById('telefono').value.trim(),
        tokenId: currentTokenId
      });

      // Cancelar suscripción en tiempo real
      if (realtimeTokenUnsub) realtimeTokenUnsub();

      // Registro exitoso -> Mostrar pantalla de éxito
      showState(stateSuccess);
      launchConfetti();

    } catch (error) {
      console.error('Error al procesar registro:', error);

      if (error.message === 'TOKEN_ALREADY_USED_OR_INVALID') {
        // Bloqueo estricto: El token ya fue consumido
        if (realtimeTokenUnsub) realtimeTokenUnsub();
        showState(stateBlocked);
        showToast('Este código QR ya fue utilizado previamente. Solicita un nuevo QR en caja.', 'danger');
      } else {
        showToast('Ocurrió un error al guardar tu registro. Inténtalo nuevamente.', 'danger');
        btnSubmit.disabled = false;
        btnText.classList.remove('hide');
        btnSpinner.classList.add('hide');
      }
    }
  });
}
