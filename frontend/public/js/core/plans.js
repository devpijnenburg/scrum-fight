// Paid plans: pure helpers shared by the subscription page (no DOM, no network).

export const PLAN_RANK = { free: 0, pro: 1, premium: 2 };
export const BILLING_PERIODS = ['monthly', 'yearly'];

// "€ 4,00" for an offer ({ amount: cents, currency }), '' when the price is unknown.
export function formatPrice(offer, lang = 'nl') {
  if (!offer || !Number.isFinite(offer.amount) || !offer.currency) return '';
  const amount = offer.amount / 100;
  try {
    return new Intl.NumberFormat(lang === 'nl' ? 'nl-NL' : 'en-GB', {
      style: 'currency',
      currency: offer.currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${offer.currency}`;
  }
}

// Largest whole-percent saving of paying yearly instead of twelve times
// monthly, over all plans; 0 when unknown or when yearly is not cheaper.
export function yearlySavingPercent(offers = {}) {
  let best = 0;
  for (const plan of Object.values(offers)) {
    const monthly = plan?.monthly?.amount;
    const yearly = plan?.yearly?.amount;
    if (!(monthly > 0) || !(yearly > 0)) continue;
    best = Math.max(best, Math.round((1 - yearly / (monthly * 12)) * 100));
  }
  return best;
}

// What the button on a plan card does for this visitor:
//   'none'     no button (free card, a lower plan, the plan they already have,
//              a plan that is not for sale, or a plan managed elsewhere)
//   'login'    visitor must log in first
//   'checkout' starts a new subscription
//   'change'   changes the existing subscription (higher plan or other period)
export function cardAction({ plan, billing, offers = {}, loggedIn, currentPlan = 'free', subscription = null }) {
  if (plan === 'free' || !offers[plan]?.[billing]) return 'none';
  if (!loggedIn) return 'login';
  if (!(currentPlan in PLAN_RANK)) return 'none'; // e.g. an organisation plan

  if (subscription) {
    if (PLAN_RANK[plan] < PLAN_RANK[subscription.plan]) return 'none';
    if (plan === subscription.plan && billing === subscription.billing) return 'none';
    return 'change';
  }
  return PLAN_RANK[plan] > PLAN_RANK[currentPlan] ? 'checkout' : 'none';
}
