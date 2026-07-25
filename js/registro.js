// ============================================================
// js/registro.js — Customer Registration & Token Validation Logic
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initRegistrationFlow();
});

let currentTokenId = null;

async function initRegistrationFlow() {
  const urlParams = new URLSearchParams(window.location.search);
  currentTokenId = urlParams.get('token');

  const stateLoading = document.getElementById('state-loading');
  const stateBlocked = document.getElementById('state-blocked');
  const stateForm    = document.getElementById('state-form');
  const stateSuccess = document.getElementById('state-success');

  // Helper to switch view state
  function showState(el) {
    [stateLoading, stateBlocked, stateForm, stateSuccess].forEach(s => s.classList.add('hide'));
    el.classList.remove('hide');
  }

  // 1. If no token in URL -> Block
  if (!currentTokenId) {
    showState(stateBlocked);
    return;
  }

  // 2. Validate token in Firebase Firestore
  try {
    const tokenData = await obtenerToken(currentTokenId);

    if (!tokenData || tokenData.estado !== 'ACTIVO') {
      // Token doesn't exist or is USADO / EXPIRED -> Block
      showState(stateBlocked);
      return;
    }

    // Token is ACTIVE -> Show Form
    showState(stateForm);
    setupFormValidation();

  } catch (error) {
    console.error('Error al validar token:', error);
    showToast('Error de conexión al verificar el código QR.', 'danger');
    showState(stateBlocked);
  }
}

function setupFormValidation() {
  const form = document.getElementById('registro-form');
  const nombreInput = document.getElementById('nombre');
  const ciInput = document.getElementById('ci');
  const ageCheck = document.getElementById('age-check');
  const btnSubmit = document.getElementById('btn-submit');
  const btnText = btnSubmit.querySelector('.btn-text');
  const btnSpinner = btnSubmit.querySelector('.btn-spinner');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Reset error states
    document.querySelectorAll('.form-group').forEach(g => g.classList.remove('has-error'));

    let isValid = true;

    // Validate Nombre
    if (!nombreInput.value.trim()) {
      document.getElementById('group-nombre').classList.add('has-error');
      isValid = false;
    }

    // Validate CI
    if (!ciInput.value.trim()) {
      document.getElementById('group-ci').classList.add('has-error');
      isValid = false;
    }

    // Validate Checkbox +18
    if (!ageCheck.checked) {
      document.getElementById('group-age').classList.add('has-error');
      isValid = false;
    }

    if (!isValid) return;

    // Start submit process
    btnSubmit.disabled = true;
    btnText.classList.add('hide');
    btnSpinner.classList.remove('hide');

    try {
      // a) Save participation in DB
      await registrarParticipacion({
        nombre: nombreInput.value.trim(),
        ci: ciInput.value.trim(),
        telefono: document.getElementById('telefono').value.trim(),
        tokenId: currentTokenId
      });

      // b) Mark token as USADO
      await marcarTokenUsado(currentTokenId);

      // c) Show success screen & launch confetti
      document.getElementById('state-form').classList.add('hide');
      document.getElementById('state-success').classList.remove('hide');
      launchConfetti();

    } catch (error) {
      console.error('Error al registrar participacion:', error);
      showToast('Ocurrió un error al guardar tu registro. Inténtalo de nuevo.', 'danger');
      btnSubmit.disabled = false;
      btnText.classList.remove('hide');
      btnSpinner.classList.add('hide');
    }
  });
}
