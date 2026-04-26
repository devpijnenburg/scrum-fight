const PaymentAdapter = require('./adapter');
const db = require('../config/database');

class ManualPaymentAdapter extends PaymentAdapter {
  async upgradePlan(userId, plan) {
    const valid = ['free', 'pro', 'premium'];
    if (!valid.includes(plan)) throw new Error(`Ongeldig plan: ${plan}`);
    await db.query(
      `UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2`,
      [plan, userId]
    );
  }

  async getUserPlan(userId) {
    const { rows } = await db.query(`SELECT plan FROM users WHERE id = $1`, [userId]);
    return rows[0]?.plan ?? 'free';
  }
}

module.exports = new ManualPaymentAdapter();
