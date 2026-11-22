// The payments feature toggle as the frontend sees it.
import { jest } from '@jest/globals';
import { paymentsEnabled, showSubscriptionLinks } from '../public/js/core/payments.js';

function mockOffers(body, ok = true) {
  global.fetch = jest.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });
}

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

test('asks the backend once and remembers the answer for this tab', async () => {
  mockOffers({ enabled: true, offers: {} });
  expect(await paymentsEnabled()).toBe(true);
  expect(await paymentsEnabled()).toBe(true);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('reports off when the backend says so', async () => {
  mockOffers({ enabled: false, offers: {} });
  expect(await paymentsEnabled()).toBe(false);
});

test('treats a failing backend as off, without remembering that', async () => {
  mockOffers({ error: 'x' }, false);
  expect(await paymentsEnabled()).toBe(false);
  mockOffers({ enabled: true, offers: {} });
  expect(await paymentsEnabled()).toBe(true);
});

test('shows subscription links when selling is on, or to manage a paid plan', () => {
  expect(showSubscriptionLinks(true, null)).toBe(true);
  expect(showSubscriptionLinks(false, null)).toBe(false);
  expect(showSubscriptionLinks(false, { plan: 'free' })).toBe(false);
  expect(showSubscriptionLinks(false, { plan: 'pro' })).toBe(true);
});
