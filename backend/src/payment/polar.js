const https = require('https');
const PaymentAdapter = require('./adapter');
const db = require('../config/database');

const PERSONAL_PLANS = ['pro', 'premium'];

function polarPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: 'api.polar.sh',
        path: `/v1${path}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (chunk) => (buf += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(buf);
            if (res.statusCode >= 400) {
              reject(new Error(`Polar API fout (${res.statusCode}): ${JSON.stringify(parsed)}`));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`Ongeldige Polar API respons: ${buf}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

class PolarPaymentAdapter extends PaymentAdapter {
  _productIdForPlan(plan) {
    const map = {
      pro: process.env.POLAR_PRO_PRODUCT_ID,
      premium: process.env.POLAR_PREMIUM_PRODUCT_ID,
    };
    return map[plan] || null;
  }

  planForProductId(productId) {
    if (productId === process.env.POLAR_PRO_PRODUCT_ID) return 'pro';
    if (productId === process.env.POLAR_PREMIUM_PRODUCT_ID) return 'premium';
    return null;
  }

  async createCheckout(userId, plan, baseUrl) {
    const productId = this._productIdForPlan(plan);
    if (!productId) throw new Error(`Geen Polar-product geconfigureerd voor plan: ${plan}`);

    const result = await polarPost('/checkouts/custom/', {
      product_id: productId,
      success_url: `${baseUrl}/dashboard.html?payment=success`,
      metadata: { userId, plan },
      customer_external_id: userId,
    });

    if (!result.url) throw new Error('Polar gaf geen checkout-URL terug');
    return result.url;
  }

  async upgradePlan(userId, plan) {
    if (!PERSONAL_PLANS.includes(plan) && plan !== 'free') {
      throw new Error(`Ongeldig plan: ${plan}`);
    }
    await db.query(
      'UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2',
      [plan, userId]
    );
  }

  async getUserPlan(userId) {
    const { rows } = await db.query('SELECT plan FROM users WHERE id = $1', [userId]);
    return rows[0]?.plan ?? 'free';
  }

  async saveSubscription(userId, polarSubscriptionId, polarCustomerId, plan) {
    await db.query(
      `INSERT INTO polar_subscriptions (user_id, polar_subscription_id, polar_customer_id, plan, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (polar_subscription_id) DO UPDATE
         SET status = 'active', updated_at = NOW()`,
      [userId, polarSubscriptionId, polarCustomerId, plan]
    );
  }

  async revokeSubscription(polarSubscriptionId) {
    const { rows } = await db.query(
      `UPDATE polar_subscriptions SET status = 'revoked', updated_at = NOW()
       WHERE polar_subscription_id = $1
       RETURNING user_id`,
      [polarSubscriptionId]
    );
    if (rows.length) {
      await this.upgradePlan(rows[0].user_id, 'free');
    }
  }
}

module.exports = new PolarPaymentAdapter();
