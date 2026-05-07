// Shared user settings modal — included on non-room pages.
// room.js has its own inline copy; do NOT include this on room.html.

const SETTINGS_KEY = 'sfSettings';

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function openSettingsModal() {
  let modal = document.getElementById('settingsModal');
  if (!modal) {
    modal = _createSettingsModal();
    document.body.appendChild(modal);
  }

  const settings = loadSettings();
  document.getElementById('settingAnalyticsAuto').checked = settings.analyticsAutoOpen !== false;
  document.getElementById('settingDefaultMethod').value   = settings.defaultMethod || '';
  modal.classList.remove('hidden');
}

function closeSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.classList.add('hidden');
}

function _createSettingsModal() {
  const div = document.createElement('div');
  div.id = 'settingsModal';
  div.className = 'modal hidden';
  div.innerHTML = `
    <div class="modal-backdrop" id="settingsBackdrop"></div>
    <div class="modal-card">
      <h2 data-i18n="room.settings.title">⚙️ Instellingen</h2>
      <div class="settings-row">
        <span class="settings-label" data-i18n="room.settings.analytics_auto">Analyse automatisch openen bij reveal</span>
        <label class="toggle-switch">
          <input type="checkbox" id="settingAnalyticsAuto" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="settings-row">
        <label class="settings-label" for="settingDefaultMethod" data-i18n="room.settings.default_method">Favoriete schattingsmethode</label>
        <select id="settingDefaultMethod" class="input" style="width:auto;min-width:160px">
          <option value=""                  data-i18n="room.settings.method_none">Geen voorkeur</option>
          <option value="fibonacci"         data-i18n="landing.create.method.fibonacci">Fibonacci 😊</option>
          <option value="modified_fibonacci" data-i18n="landing.create.method.modified_fibonacci">Modified Fibonacci</option>
          <option value="tshirt"            data-i18n="landing.create.method.tshirt">T-shirt maten</option>
          <option value="powers_of_2"       data-i18n="landing.create.method.powers_of_2">Powers of 2</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-sm" id="settingsCancelBtn" data-i18n="dashboard.modal.cancel">Annuleren</button>
        <button class="btn btn-primary btn-sm" id="settingsSaveBtn"   data-i18n="room.settings.save">Opslaan</button>
      </div>
    </div>
  `;

  div.querySelector('#settingsBackdrop').addEventListener('click', closeSettingsModal);
  div.querySelector('#settingsCancelBtn').addEventListener('click', closeSettingsModal);
  div.querySelector('#settingsSaveBtn').addEventListener('click', () => {
    const settings = loadSettings();
    settings.analyticsAutoOpen = document.getElementById('settingAnalyticsAuto').checked;
    settings.defaultMethod     = document.getElementById('settingDefaultMethod').value;
    saveSettings(settings);
    closeSettingsModal();
    if (typeof applyTranslations === 'function') applyTranslations();
  });

  return div;
}
