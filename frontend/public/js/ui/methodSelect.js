// Estimation-method <select>, filled from one list.
//
//   <select id="method" class="input" data-method-select></select>
//   <select id="pref" class="input" data-method-select data-include-none></select>
//
// Filled automatically on DOMContentLoaded (or call fillMethodSelect(el)).
// Without an explicit `data-selected`, the user's preferred method from
// settings is preselected, falling back to Fibonacci+.

const ESTIMATION_METHODS = [
  { value: 'fibonacci',          i18n: 'landing.create.method.fibonacci',          label: 'Fibonacci' },
  { value: 'modified_fibonacci', i18n: 'landing.create.method.modified_fibonacci', label: 'Fibonacci+' },
  { value: 'tshirt',             i18n: 'landing.create.method.tshirt',             label: 'T-shirt maten' },
  { value: 'powers_of_2',        i18n: 'landing.create.method.powers_of_2',        label: 'Powers of 2' },
];
const DEFAULT_METHOD = 'modified_fibonacci';

function _methodLabel(key, fallback) {
  if (typeof t !== 'function') return fallback;
  const text = t(key);
  return text === key ? fallback : text;
}

function fillMethodSelect(select, { includeNone = select.hasAttribute('data-include-none'), selected } = {}) {
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

  const preferred = typeof loadSettings === 'function' ? loadSettings().defaultMethod : '';
  const wanted = selected ?? select.dataset.selected ?? (includeNone ? '' : preferred || DEFAULT_METHOD);
  select.value = options.some((o) => o.value === wanted) ? wanted : options[0].value;
  return select;
}

function fillAllMethodSelects(root = document) {
  root.querySelectorAll('select[data-method-select]').forEach((el) => fillMethodSelect(el));
}

// Pages load scripts at the end of <body>, so the selects already exist:
// fill them right away, before page scripts read or set their value.
if (typeof document !== 'undefined') {
  if (document.body) fillAllMethodSelects();
  else document.addEventListener('DOMContentLoaded', () => fillAllMethodSelects());
}

if (typeof module !== 'undefined') module.exports = { fillMethodSelect, fillAllMethodSelects, ESTIMATION_METHODS };
