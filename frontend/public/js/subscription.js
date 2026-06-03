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
      const { url, checkoutId } = await apiFetch('/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan, billing: _billing }),
      });
      // Store so the return page can verify against Creem directly
      if (checkoutId) sessionStorage.setItem('pending_checkout_id', checkoutId);
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
    spinner.classList.add('hidden');
    check.classList.remove('hidden');

    step2.classList.remove('pay-proc-step--active');
    step2.classList.add('pay-proc-step--done');
    dot2.classList.remove('pay-proc-dot--active');
    dot2.classList.add('pay-proc-dot--done');

    step3.classList.remove('pay-proc-step--pending');
    step3.classList.add('pay-proc-step--done');
    dot3.classList.add('pay-proc-dot--done');

    title.textContent = 'Plan bijgewerkt!';
    title.classList.add('pay-proc-title--success');
    subtitle.textContent = 'Welkom als supporter — heel erg bedankt. 🙏';

    // setTimeout matches CSS fade-out duration — more reliable than animationend
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

  // Checkout ID stored by the upgrade button before redirect; used to verify
  // payment directly against Creem when inbound webhooks are blocked.
  const pendingCheckoutId = sessionStorage.getItem('pending_checkout_id');

  let done = false;

  function onPlanConfirmed(token) {
    if (done) return;
    done = true;
    clearInterval(interval);
    socket.disconnect();
    sessionStorage.removeItem('pending_checkout_id');
    if (token) localStorage.setItem('token', token);
    showSuccess();
  }

  // ── WebSocket — instant notification when webhook is processed ────────────
  const socket = io({ transports: ['websocket'] });
  const storedToken = localStorage.getItem('token');
  if (storedToken) {
    socket.emit('register-user', { token: storedToken });
  }

  socket.on('plan:updated', async () => {
    try {
      const { token } = await apiFetch('/auth/refresh', { method: 'POST' });
      onPlanConfirmed(token);
    } catch {
      onPlanConfirmed(null);
    }
  });

  // ── Active verification polling ───────────────────────────────────────────
  // Calls /payments/verify which makes an outbound call to Creem's API to
  // check the checkout status directly. This works even when inbound webhooks
  // are blocked by the server's network policy.
  let attempts = 0;
  const maxAttempts = 15; // 30 seconds

  const interval = setInterval(async () => {
    if (done) return;
    attempts++;
    try {
      const data = await apiFetch('/payments/verify', {
        method: 'POST',
        body: JSON.stringify({ checkoutId: pendingCheckoutId }),
      });
      if (data.plan && data.plan !== 'free') {
        onPlanConfirmed(data.token ?? null);
        return;
      }
    } catch {
      // network hiccup — keep trying
    }

    if (attempts >= maxAttempts) {
      clearInterval(interval);
      socket.disconnect();
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
