// The room page still loads the shared helpers as classic scripts
// (i18n.js, api.js, auth.js, settings.js, ui/*, badges.js). This module is
// the single seam to them: room modules import from here instead of
// touching window globals directly, so converting those helpers to ES
// modules later only changes this file.

const g = window;

export const t = (key, vars) => g.t(key, vars);
export const getLang = () => (typeof g.getLang === 'function' ? g.getLang() : 'en');
export const apiFetch = (path, options) => g.apiFetch(path, options);
export const getCurrentUser = () => g.getCurrentUser();
export const escapeHtml = (str) => g.escapeHtml(str);
export const loadSettings = () => g.loadSettings();
export const openModal = (target, options) => g.openModal(target, options);
export const closeModal = (target) => g.closeModal(target);
export const showToast = (text, options) => g.showToast(text, options);

// Badge catalogue and shield renderer from badges.js (optional on the page).
export const findBadge = (id) => (Array.isArray(g.BADGES) ? g.BADGES.find((b) => b.id === id) : null);
export const shieldSvg = (...args) => (typeof g.shieldSvg === 'function' ? g.shieldSvg(...args) : '');

export const createSocket = () => g.io();
