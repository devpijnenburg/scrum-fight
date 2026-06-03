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

// ── Payment processing overlay ────────────────────────────────────────────────

(function handlePaymentReturn() {
  if (urlParams.get('payment') !== 'success') return;
  history.replaceState({}, '', '/subscription.html');

  // Show overlay, hide main page content
  const overlay = document.getElementById('paymentProcessing');
  const main    = document.getElementById('subscriptionMain');
  overlay.classList.remove('hidden');
  main.classList.add('hidden');

  const title    = document.getElementById('payProcTitle');
  const subtitle = document.getElementById('payProcSubtitle');
  const step2    = document.getElementById('payProcStep2');
  const dot2     = document.getElementById('payProcDot2');
  const step3    = document.getElementById('payProcStep3');
  const dot3     = document.getElementById('payProcDot3');
  const spinner  = document.getElementById('payProcSpinner');
  const check    = document.getElementById('payProcCheck');
  const timeout  = document.getElementById('payProcTimeout');

  function showSuccess() {
    // Stop spinner, show animated checkmark
    spinner.classList.add('hidden');
    check.classList.remove('hidden');

    // Step 2 → done
    step2.classList.remove('pay-proc-step--active');
    step2.classList.add('pay-proc-step--done');
    dot2.classList.remove('pay-proc-dot--active');
    dot2.classList.add('pay-proc-dot--done');

    // Step 3 → done
    step3.classList.remove('pay-proc-step--pending');
    step3.classList.add('pay-proc-step--done');
    dot3.classList.add('pay-proc-dot--done');

    title.textContent = 'Plan bijgewerkt!';
    title.classList.add('pay-proc-title--success');
    subtitle.textContent = 'Welkom als supporter — heel erg bedankt. 🙏';

    // Fade out overlay after a short pause, then reveal updated plan page.
    // setTimeout matches the CSS fade-out duration — more reliable than animationend
    // (animationend bubbles from child elements and could fire too early).
    setTimeout(() => {
      overlay.classList.add('pay-proc--fade-out');
      setTimeout(() => {
        overlay.classList.add('hidden');
        main.classList.remove('hidden');
        initPlanState();
      }, 520);
    }, 1800);
  }

  function showTimeout() {
    spinner.style.opacity = '.3';
    title.textContent = 'Duurt wat langer…';
    subtitle.textContent = '';
    timeout.classList.remove('hidden');
  }

  let attempts = 0;
  const maxAttempts = 15; // 30 seconds

  const interval = setInterval(async () => {
    attempts++;
    try {
      const { token } = await apiFetch('/auth/refresh', { method: 'POST' });
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.plan !== 'free') {
        clearInterval(interval);
        localStorage.setItem('token', token);
        showSuccess();
        return;
      }
      localStorage.setItem('token', token);
    } catch {
      // network hiccup — keep trying
    }

    if (attempts >= maxAttempts) {
      clearInterval(interval);
      showTimeout();
    }
  }, 2000);
})();

// ── Plan state ────────────────────────────────────────────────────────────────

// Refreshes the JWT when DB plan differs from the stored token, marks the
// active plan card, and highlights the pre-selected plan from the URL.
async function initPlanState() {
  try {
    const data = await apiFetch('/auth/me');
    const currentPlan = data.plan;

    // Silently refresh JWT if it's stale
    const jwtPlan = getCurrentUser()?.plan;
    if (jwtPlan && jwtPlan !== currentPlan) {
      try {
        const { token } = await apiFetch('/auth/refresh', { method: 'POST' });
        localStorage.setItem('token', token);
      } catch { /* non-fatal */ }
    }

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
      if (plan === currentPlan) {
        card.setAttribute('data-active', 'true');
        const btn = card.querySelector('.plan-upgrade-btn');
        if (btn) btn.remove();
        return;
      }
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
  } catch { /* Fail silently — page still usable */ }
}

// Only run initPlanState now if we're NOT in payment-return mode
// (in that case it's called after the overlay fades out)
if (urlParams.get('payment') !== 'success') {
  initPlanState();
}
