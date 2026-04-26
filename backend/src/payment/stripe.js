const PaymentAdapter = require('./adapter');

// Stub — wire up Stripe SDK here when ready.
class StripePaymentAdapter extends PaymentAdapter {
  async upgradePlan(userId, plan) {
    throw new Error('Stripe is not yet configured. Use ManualPaymentAdapter.');
  }

  async getUserPlan(userId) {
    throw new Error('Stripe is not yet configured. Use ManualPaymentAdapter.');
  }
}

module.exports = new StripePaymentAdapter();
