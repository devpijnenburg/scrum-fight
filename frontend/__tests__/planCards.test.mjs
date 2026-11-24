// <sf-plan-cards>: the shared plan cards of the dashboard and the subscription page.
import { jest } from '@jest/globals';
import '../public/js/ui/planCards.js';
import { setLang } from '../public/js/core/i18n.js';

const OFFERS = {
  enabled: true,
  offers: {
    pro: { monthly: { amount: 500, currency: 'EUR' }, yearly: { amount: 3900, currency: 'EUR' } },
    premium: { monthly: { amount: 900, currency: 'EUR' }, yearly: { amount: 7900, currency: 'EUR' } },
  },
};

function login(plan = 'free') {
  const payload = btoa(JSON.stringify({ id: 'u1', name: 'Alice', plan, exp: Math.floor(Date.now() / 1000) + 3600 }));
  localStorage.setItem('token', `x.${payload}.y`);
}

// Answers the API calls of the component; `calls` records them.
function mockApi(responses) {
  const calls = [];
  global.fetch = jest.fn(async (url, options = {}) => {
    const path = url.replace('/api', '');
    calls.push({ path, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
    const body = responses[path];
    return { ok: body !== undefined, status: body !== undefined ? 200 : 404, json: async () => body ?? { error: 'nf' } };
  });
  return calls;
}

async function mount(attributes = {}) {
  const el = document.createElement('sf-plan-cards');
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  el.redirect = jest.fn();
  document.body.appendChild(el);
  await el.loaded;
  return el;
}

const price = (el, plan) => el.querySelector(`[data-plan="${plan}"] [data-price]`).textContent.replace(/\s/g, ' ');
const button = (el, plan) => el.querySelector(`[data-plan="${plan}"] [data-action] .btn`);

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  setLang('nl');
});

test('shows the three plans with yearly prices and the saving', async () => {
  login('free');
  mockApi({ '/payments/offers': OFFERS, '/payments/subscription': { plan: 'free', subscription: null } });
  const el = await mount();

  expect([...el.querySelectorAll('.plan-card')].map((c) => c.dataset.plan)).toEqual(['free', 'pro', 'premium']);
  expect(price(el, 'pro')).toBe('€ 39 per jaar');
  expect(price(el, 'premium')).toBe('€ 79 per jaar');
  expect(el.querySelector('.billing-save-badge').textContent).toBe('Bespaar 35%');
  expect(el.querySelector('[data-plan="free"]').getAttribute('data-active')).toBe('true');
  expect(el.querySelector('[data-plan="free"] .plan-features').textContent).toContain('7 deelnemers');
});

test('switches between monthly and yearly', async () => {
  login('free');
  mockApi({ '/payments/offers': OFFERS, '/payments/subscription': { plan: 'free', subscription: null } });
  const el = await mount();

  el.querySelector('[data-billing="monthly"]').click();
  expect(price(el, 'pro')).toBe('€ 5 per maand');
  expect(el.querySelector('[data-billing="monthly"]').getAttribute('aria-pressed')).toBe('true');
});

test('"Upgraden" goes straight to the checkout with the chosen plan and period', async () => {
  login('free');
  const calls = mockApi({
    '/payments/offers': OFFERS,
    '/payments/subscription': { plan: 'free', subscription: null },
    '/payments/checkout': { url: 'https://checkout.example/pay' },
  });
  const el = await mount();

  el.querySelector('[data-billing="monthly"]').click();
  button(el, 'premium').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(calls.at(-1)).toEqual({ path: '/payments/checkout', method: 'POST', body: { plan: 'premium', billing: 'monthly' } });
  expect(el.redirect).toHaveBeenCalledWith('https://checkout.example/pay');
});

test('shows no prices and no buttons while selling is switched off', async () => {
  login('free');
  mockApi({ '/payments/offers': { enabled: false, offers: {} }, '/payments/subscription': { plan: 'free', subscription: null } });
  const el = await mount();

  expect(el.querySelectorAll('[data-action] .btn')).toHaveLength(0);
  expect(price(el, 'pro')).toBe('');
  expect(el.querySelector('.billing-toggle').classList.contains('hidden')).toBe(true);
});

test('sends a visitor without account to the login page first', async () => {
  mockApi({ '/payments/offers': OFFERS });
  const el = await mount();

  expect(button(el, 'pro').getAttribute('href'))
    .toBe('/login.html?next=%2Fsubscription.html%3Fplan%3Dpro%26billing%3Dyearly');
  expect(el.querySelector('[data-active]')).toBeNull();
});

test('offers a subscriber only an upgrade or another period', async () => {
  login('pro');
  mockApi({
    '/payments/offers': OFFERS,
    '/payments/subscription': { plan: 'pro', subscription: { plan: 'pro', billing: 'monthly', status: 'active' } },
  });
  const el = await mount();

  // Starts on the period the subscriber pays in.
  expect(price(el, 'pro')).toBe('€ 5 per maand');
  expect(button(el, 'pro')).toBeNull();
  expect(button(el, 'premium').dataset.change).toBe('premium');

  el.querySelector('[data-billing="yearly"]').click();
  expect(button(el, 'pro').textContent).toBe('Naar jaarlijks');
});

test('reports what it loaded, and follows attributes set afterwards', async () => {
  login('free');
  mockApi({ '/payments/offers': OFFERS, '/payments/subscription': { plan: 'free', subscription: null } });
  const loaded = jest.fn();
  document.body.addEventListener('plans:loaded', (e) => loaded(e.detail));
  const el = await mount();

  expect(loaded).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, plan: 'free', subscription: null }));

  el.setAttribute('billing', 'monthly');
  el.setAttribute('selected', 'pro');
  expect(price(el, 'pro')).toBe('€ 5 per maand');
  expect(el.querySelector('[data-plan="pro"]').hasAttribute('data-selected')).toBe(true);
});
