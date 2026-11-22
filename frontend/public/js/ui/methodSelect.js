import { t } from '../core/i18n.js';
import { loadSettings } from '../core/settings.js';

// Estimation-method <select>, filled from one list.
//
//   <select id="method" class="input" data-method-select></select>
//   <select id="pref" class="input" data-method-select data-include-none></select>
//
// Filled automatically when this module is imported (or call fillMethodSelect(el)).
// Without an explicit `data-selected`, the user's preferred method from
// settings is preselected, falling back to Fibonacci+.

export const ESTIMATION_METHODS = [
  { value: 'fibonacci',          i18n: 'landing.create.method.fibonacci',          label: 'Fibonacci' },
  { value: 'modified_fibonacci', i18n: 'landing.create.method.modified_fibonacci', label: 'Fibonacci+' },
  { value: 'tshirt',             i18n: 'landing.create.method.tshirt',             label: 'T-shirt maten' },
  { value: 'powers_of_2',        i18n: 'landing.create.method.powers_of_2',        label: 'Powers of 2' },
];
const DEFAULT_METHOD = 'modified_fibonacci';

function _methodLabel(key, fallback) {
  const text = t(key);
  return text === key ? fallback : text;
}

export function fillMethodSelect(select, { includeNone = select.hasAttribute('data-include-none'), selected } = {}) {
  const options = [];
  if (includeNone) options.push({ value: '', i18n: 'room.settings.method_none', label: 'Geen voorkeur' });
  options.push(...ESTIMATION_METHODS);

  select.innerHTML = '';
  for (const m of options) {
    const opt = document.createElement('option');
    opt.value = m.value;
    opt.dataset.i18n = m.i18n; // re-translated by applyTranslations() on language change
    opt.textContent = _methodLabel(m.i18n, m.label);
    select.appendChild(opt);
  }

  const preferred = loadSettings().defaultMethod;
  const wanted = selected ?? select.dataset.selected ?? (includeNone ? '' : preferred || DEFAULT_METHOD);
  select.value = options.some((o) => o.value === wanted) ? wanted : options[0].value;
  return select;
}

export function fillAllMethodSelects(root = document) {
  root.querySelectorAll('select[data-method-select]').forEach((el) => fillMethodSelect(el));
}

// Module scripts run after the document is parsed, so the selects exist:
// fill them on import, before page code reads or sets their value.
fillAllMethodSelects();
