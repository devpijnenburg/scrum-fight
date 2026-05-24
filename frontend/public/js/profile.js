const user = getCurrentUser();
if (!user) window.location.href = '/login.html';

updateNavbar();

let _totpSecret = null;

async function loadProfile() {
  const data = await apiFetch('/auth/me');
  document.getElementById('profileSubtitle').textContent = data.email || data.name;
  document.getElementById('profileName').textContent = data.name;
  document.getElementById('profileEmail').textContent = data.email || '—';
  document.getElementById('profileAuth').textContent = data.oauth_provider
    ? data.oauth_provider.charAt(0).toUpperCase() + data.oauth_provider.slice(1)
    : 'E-mail / wachtwoord';
  document.getElementById('profilePlan').textContent = data.plan.toUpperCase();
  setTotpState(data.totp_enabled);
}

function setTotpState(enabled) {
  document.getElementById('totpDisabled').classList.toggle('hidden', enabled);
  document.getElementById('totpEnabled').classList.toggle('hidden', !enabled);
  document.getElementById('totpSetup').classList.add('hidden');
  document.getElementById('totpDisableConfirm').classList.add('hidden');
}

document.getElementById('totpSetupBtn').addEventListener('click', async () => {
  document.getElementById('totpDisabled').classList.add('hidden');
  document.getElementById('totpSetup').classList.remove('hidden');
  try {
    const { secret, qrDataUrl } = await apiFetch('/profile/totp/setup');
    _totpSecret = secret;
    document.getElementById('totpQr').src = qrDataUrl;
    document.getElementById('totpSecret').textContent = secret;
    document.getElementById('totpEnableCode').focus();
  } catch (ex) {
    alert('Fout bij ophalen QR-code: ' + ex.message);
    setTotpState(false);
  }
});

document.getElementById('totpSetupCancelBtn').addEventListener('click', () => {
  _totpSecret = null;
  setTotpState(false);
});

document.getElementById('totpEnableBtn').addEventListener('click', async () => {
  const err = document.getElementById('totpEnableError');
  err.classList.add('hidden');
  const code = document.getElementById('totpEnableCode').value.trim();
  try {
    await apiFetch('/profile/totp/enable', {
      method: 'POST',
      body: JSON.stringify({ secret: _totpSecret, code }),
    });
    _totpSecret = null;
    setTotpState(true);
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  }
});

document.getElementById('totpEnableCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('totpEnableBtn').click();
});

document.getElementById('totpDisableBtn').addEventListener('click', () => {
  document.getElementById('totpEnabled').classList.add('hidden');
  document.getElementById('totpDisableConfirm').classList.remove('hidden');
  document.getElementById('totpDisableCode').focus();
});

document.getElementById('totpDisableCancelBtn').addEventListener('click', () => {
  setTotpState(true);
});

document.getElementById('totpDisableConfirmBtn').addEventListener('click', async () => {
  const err = document.getElementById('totpDisableError');
  err.classList.add('hidden');
  const code = document.getElementById('totpDisableCode').value.trim();
  try {
    await apiFetch('/profile/totp/disable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    setTotpState(false);
  } catch (ex) {
    err.textContent = ex.message;
    err.classList.remove('hidden');
  }
});

document.getElementById('totpDisableCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('totpDisableConfirmBtn').click();
});

loadProfile();
