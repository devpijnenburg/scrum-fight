// Subscription page logic

const user = getCurrentUser();
if (!user) window.location.href = '/login.html';

updateNavbar();

const urlParams = new URLSearchParams(location.search);

// Pre-select billing period from URL param (default: yearly)
let _billing = urlParams.get('billing') === 'monthly' ? 'monthly' : 'yearly';

// Apply initial billing toggle state
document.querySelectorAll('.billing-toggle-btn').forEach((btn) => {
  btn.classList.toggle('billing-toggle-btn--active', btn.dataset.billing === _billing);
  btn.addEventListener('click', () => {
    _billing = btn.dataset.billing;
    document.querySelectorAll('.billing-toggle-btn').forEach((b) =>
      b.classList.toggle('billing-toggle-btn--active', b.dataset.billing === _billing)
    );
  });
});

// Wire upgrade buttons to Creem checkout
document.querySelectorAll('.plan-upgrade-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const plan = btn.dataset.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Laden…';
    try {
      const { url } = await apiFetch('/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan, billing: _billing }),
      });
      window.location.href = url;
    } catch (err) {
      btn.disabled = false;
      btn.textContent = originalText;
      alert(err.message || 'Kon de betaalpagina niet openen. Probeer het later opnieuw.');
    }
  });
});

// Handle redirect back from Creem after successful payment
(function handlePaymentReturn() {
  if (urlParams.get('payment') !== 'success') return;
  history.replaceState({}, '', '/subscription.html');

  const banner = document.getElementById('paymentBanner');
  banner.style.cssText = 'background:#22c55e;color:#fff;border-color:#16a34a';
  banner.textContent =
    '✓ Welkom als supporter! Jouw bijdrage houdt Scrum Fight draaiende — heel erg bedankt. 🙏 ' +
    'Je abonnement wordt bijgewerkt…';
  banner.classList.remove('hidden');

  let attempts = 0;
  const maxAttempts = 10;
  const interval = setInterval(async () => {
    attempts++;
    try {
      const { token } = await apiFetch('/auth/refresh', { method: 'POST' });
      localStorage.setItem('token', token);
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.plan !== 'free' || attempts >= maxAttempts) {
        clearInterval(interval);
        if (payload.plan !== 'free') {
          banner.textContent =
            '✓ Welkom als supporter! Jouw bijdrage houdt Scrum Fight draaiende — heel erg bedankt. 🙏';
          window.location.reload();
        }
      }
    } catch {
      if (attempts >= maxAttempts) clearInterval(interval);
    }
  }, 2000);
})();

// Mark current plan and highlight pre-selected plan from URL
async function initPlanState() {
  try {
    const data = await apiFetch('/auth/me');
    const currentPlan = data.plan;

    // Show supporter note for paid users
    if (currentPlan !== 'free' && data.subscription_date) {
      const dateStr = new Date(data.subscription_date).toLocaleDateString('nl-NL', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      const noteEl = document.getElementById('supporterNote');
      noteEl.innerHTML = `
        <div class="supporter-note">
          <span class="supporter-note-icon">🙏</span>
          <div>
            <strong>Bedankt dat je Scrum Fight steunt!</strong>
            <p>Jouw abonnement helpt de server- en ontwikkelkosten te dekken. Dat wordt enorm gewaardeerd.</p>
            <p class="text-muted" style="font-size:.85rem;margin-top:.25rem">Laatste betaling: ${dateStr}</p>
          </div>
        </div>`;
      noteEl.classList.remove('hidden');
    }

    const PLAN_RANK = { free: 0, pro: 1, premium: 2 };

    document.querySelectorAll('.plan-card').forEach((card) => {
      const plan = card.dataset.plan;

      // Mark active plan
      if (plan === currentPlan) {
        card.setAttribute('data-active', 'true');
        const btn = card.querySelector('.plan-upgrade-btn');
        if (btn) btn.remove();
        return;
      }

      // Remove upgrade button for lower/equal plans
      if (PLAN_RANK[plan] <= PLAN_RANK[currentPlan]) {
        const btn = card.querySelector('.plan-upgrade-btn');
        if (btn) btn.remove();
      }
    });

    // Highlight plan from URL param
    const selectedPlan = urlParams.get('plan');
    if (selectedPlan) {
      const card = document.querySelector(`.plan-card[data-plan="${selectedPlan}"]`);
      if (card && !card.hasAttribute('data-active')) {
        card.setAttribute('data-selected', 'true');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  } catch {
    // Fail silently — page still usable
  }
}

initPlanState();
