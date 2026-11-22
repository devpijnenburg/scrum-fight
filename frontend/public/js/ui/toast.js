// Small transient notifications in the bottom corner.
//
//   showToast('Opgeslagen');
//   showToast('Badge verdiend', { icon: '🏅', html: '<strong>Alice</strong> …', variant: 'gold' });
//
// `text` is always escaped; pass pre-escaped markup via `html` instead.

const TOAST_DEFAULT_MS = 4000;

function _toastContainer() {
  let el = document.getElementById('toastContainer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toastContainer';
    el.className = 'toast-container';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  return el;
}

function _escapeToastText(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(text, { icon = '', html = null, duration = TOAST_DEFAULT_MS, variant = '' } = {}) {
  const toast = document.createElement('div');
  toast.className = variant ? `toast toast-${variant}` : 'toast';
  toast.setAttribute('role', 'status');
  toast.innerHTML =
    (icon ? `<span class="toast-icon">${_escapeToastText(icon)}</span>` : '') +
    `<span class="toast-text">${html ?? _escapeToastText(text)}</span>`;
  _toastContainer().appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-hide');
    // Remove after the exit animation; fall back for reduced motion / no animation.
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 600);
  }, duration);
  return toast;
}

if (typeof module !== 'undefined') module.exports = { showToast };
