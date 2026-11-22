// Pure helpers behind the subscription page: prices and what each plan
// card offers to a given visitor.
import { existsSync } from 'node:fs';
import { formatPrice, yearlySavingPercent, cardAction, planName, planShieldUrl } from '../public/js/core/plans.js';
import { TRANSLATIONS } from '../public/js/core/i18n.js';

const offers = {
  pro: { monthly: { amount: 400, currency: 'EUR' }, yearly: { amount: 4000, currency: 'EUR' } },
  premium: { yearly: { amount: 9900, currency: 'EUR' } },
};

test('formats a price from cents, and nothing when the price is unknown', () => {
  expect(formatPrice({ amount: 400, currency: 'EUR' }, 'nl').replace(/\s/g, ' ')).toBe('€ 4');
  expect(formatPrice({ amount: 499, currency: 'EUR' }, 'en')).toBe('€4.99');
  expect(formatPrice({}, 'nl')).toBe('');
  expect(formatPrice(undefined, 'nl')).toBe('');
});

test('computes the yearly saving from the real prices', () => {
  expect(yearlySavingPercent(offers)).toBe(17); // 40 instead of 48
  expect(yearlySavingPercent({ pro: { monthly: { amount: 400 } } })).toBe(0);
  expect(yearlySavingPercent({ pro: { monthly: { amount: 400 }, yearly: { amount: 6000 } } })).toBe(0);
  expect(yearlySavingPercent({})).toBe(0);
});

describe('cardAction', () => {
  const base = { billing: 'yearly', offers, loggedIn: true, currentPlan: 'free', subscription: null };

  test('never offers the free plan or a plan that is not for sale', () => {
    expect(cardAction({ ...base, plan: 'free' })).toBe('none');
    expect(cardAction({ ...base, plan: 'premium', billing: 'monthly' })).toBe('none');
  });

  test('asks a visitor to log in first', () => {
    expect(cardAction({ ...base, plan: 'pro', loggedIn: false })).toBe('login');
  });

  test('offers a checkout to someone on the free plan', () => {
    expect(cardAction({ ...base, plan: 'pro' })).toBe('checkout');
    expect(cardAction({ ...base, plan: 'premium' })).toBe('checkout');
  });

  test('lets a subscriber go up or switch period, never down or to the same offer', () => {
    const subscriber = { ...base, currentPlan: 'pro', subscription: { plan: 'pro', billing: 'monthly' } };
    expect(cardAction({ ...subscriber, plan: 'premium' })).toBe('change');
    expect(cardAction({ ...subscriber, plan: 'pro', billing: 'yearly' })).toBe('change');
    expect(cardAction({ ...subscriber, plan: 'pro', billing: 'monthly' })).toBe('none');

    const premium = { ...base, currentPlan: 'premium', subscription: { plan: 'premium', billing: 'yearly' } };
    expect(cardAction({ ...premium, plan: 'pro' })).toBe('none');
  });

  test('offers nothing above a plan granted without a subscription, or on an organisation plan', () => {
    expect(cardAction({ ...base, plan: 'pro', currentPlan: 'premium' })).toBe('none');
    expect(cardAction({ ...base, plan: 'premium', currentPlan: 'pro' })).toBe('checkout');
    expect(cardAction({ ...base, plan: 'premium', currentPlan: 'org_starter' })).toBe('none');
  });
});

test('every subscription text exists in both languages', () => {
  const keys = (lang) => Object.keys(TRANSLATIONS[lang])
    .filter((key) => /^(subscription|profile\.subscription)\.|^errors\.(PAYMENT|PLAN_|ALREADY_SUB|NO_SUB|INVALID_BILLING)/.test(key))
    .sort();
  expect(keys('nl').length).toBeGreaterThan(30);
  expect(keys('en')).toEqual(keys('nl'));
});

test('every personal plan has a shield image, other plans have none', () => {
  for (const plan of ['free', 'pro', 'premium']) {
    expect(planName(plan)).toBeTruthy();
    expect(existsSync(`public${planShieldUrl(plan)}`)).toBe(true);
  }
  expect(planName('org_starter')).toBeNull();
  expect(planShieldUrl('org_starter')).toBeNull();
  expect(planShieldUrl(undefined)).toBeNull();
});
