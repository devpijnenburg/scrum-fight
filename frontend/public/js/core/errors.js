// Turns a backend error into text in the current language.
//
// REST responses ({ error, code, …details }) and socket 'error' events
// ({ message, code, …details }) share one shape: a stable `code`, a Dutch
// fallback text and optional details (e.g. { limit }, { plan, max }) that
// fill the {placeholders} of the i18n entry `errors.<CODE>`.

import { t } from './i18n.js';

export function errorText(payload = {}, fallback = 'Er ging iets mis') {
  if (payload.code) {
    const key = `errors.${payload.code}`;
    const text = t(key, payload);
    if (text !== key) return text;
  }
  return payload.error || payload.message || fallback;
}
