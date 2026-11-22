import { t } from '../core/i18n.js';

// Modal behaviour for the shared `.modal` markup:
//
//   <div id="fooModal" class="modal hidden">
//     <div class="modal-backdrop"></div>
//     <div class="modal-card"> … <button data-modal-close>Annuleren</button> … </div>
//   </div>
//
// openModal('fooModal') / closeModal('fooModal') accept an id or element.
// Every modal gets, once: close on backdrop click, on [data-modal-close]
// and on Escape (topmost modal only). Add `data-modal-static` to a modal
// that must not be dismissed that way (e.g. a required name prompt).
// Focus moves into the modal on open and back to the trigger on close.
// The modal element fires `modal:open` and `modal:close` events.

const _modalReturnFocus = new WeakMap();
const _modalStack = [];

function _modalEl(target) {
  return typeof target === 'string' ? document.getElementById(target) : target;
}

function _wireModal(modal) {
  if (modal._sfModalWired) return;
  modal._sfModalWired = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const dismissable = () => !modal.hasAttribute('data-modal-static');
  modal.querySelector('.modal-backdrop')?.addEventListener('click', () => {
    if (dismissable()) closeModal(modal);
  });
  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-modal-close]')) closeModal(modal);
  });
}

export function isModalOpen(target) {
  const modal = _modalEl(target);
  return !!modal && !modal.classList.contains('hidden');
}

export function openModal(target, { focus } = {}) {
  const modal = _modalEl(target);
  if (!modal) return null;
  _wireModal(modal);
  if (!isModalOpen(modal)) {
    _modalReturnFocus.set(modal, document.activeElement);
    modal.classList.remove('hidden');
    _modalStack.push(modal);
    modal.dispatchEvent(new CustomEvent('modal:open'));
  }
  const focusEl = focus
    ? modal.querySelector(focus)
    : modal.querySelector('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea, button:not([data-modal-close])');
  focusEl?.focus();
  return modal;
}

export function closeModal(target) {
  const modal = _modalEl(target);
  if (!modal || !isModalOpen(modal)) return;
  modal.classList.add('hidden');
  const i = _modalStack.lastIndexOf(modal);
  if (i !== -1) _modalStack.splice(i, 1);
  modal.dispatchEvent(new CustomEvent('modal:close'));
  const returnTo = _modalReturnFocus.get(modal);
  if (returnTo && typeof returnTo.focus === 'function' && document.contains(returnTo)) returnTo.focus();
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // Drop modals that were hidden by other code without closeModal().
  while (_modalStack.length && !isModalOpen(_modalStack.at(-1))) _modalStack.pop();
  const top = _modalStack.at(-1);
  if (top && !top.hasAttribute('data-modal-static')) {
    e.preventDefault();
    closeModal(top);
  }
});

// ── Confirm dialog (replaces window.confirm) ────────────────────────────────
//
//   if (await confirmDialog('Kamer verwijderen?')) { … }
//
// Resolves true on confirm, false on cancel, backdrop click or Escape.

function _uiText(key, fallback) {
  const text = t(key);
  return text === key ? fallback : text;
}

function _confirmModal() {
  let modal = document.getElementById('sfConfirmModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'sfConfirmModal';
  modal.className = 'modal hidden';
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-card modal-card-sm modal-card-center">
      <p class="confirm-message"></p>
      <div class="modal-actions modal-actions-center">
        <button type="button" class="btn btn-ghost confirm-cancel" data-modal-close></button>
        <button type="button" class="btn btn-primary confirm-ok"></button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

export function confirmDialog(message, { confirmLabel, cancelLabel, danger = true } = {}) {
  const modal = _confirmModal();
  modal.querySelector('.confirm-message').textContent = message;
  const ok = modal.querySelector('.confirm-ok');
  ok.textContent = confirmLabel || _uiText('ui.confirm.delete', 'Verwijderen');
  ok.classList.toggle('btn-danger', danger);
  modal.querySelector('.confirm-cancel').textContent = cancelLabel || _uiText('ui.confirm.cancel', 'Annuleren');

  return new Promise((resolve) => {
    let confirmed = false;
    const onOk = () => { confirmed = true; closeModal(modal); };
    ok.addEventListener('click', onOk, { once: true });
    modal.addEventListener('modal:close', () => {
      ok.removeEventListener('click', onOk);
      resolve(confirmed);
    }, { once: true });
    openModal(modal, { focus: '.confirm-ok' });
  });
}
