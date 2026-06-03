const https = require('https');
const PaymentAdapter = require('./adapter');
const db = require('../config/database');

const PERSONAL_PLANS = ['pro', 'premium'];

function creemPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: 'api.creem.io',
        path: `/v1${path}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.CREEM_API_KEY,
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
              reject(new Error(`Creem API fout (${res.statusCode}): ${JSON.stringify(parsed)}`));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error(`Ongeldige Creem API respons: ${buf}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

class CreemPaymentAdapter extends PaymentAdapter {
  _productIdForPlan(plan, billing = 'monthly') {
    const map = {
      pro: {
        monthly: process.env.CREEM_PRO_MONTHLY_PRODUCT_ID,
        yearly:  process.env.CREEM_PRO_YEARLY_PRODUCT_ID,
      },
      premium: {
        monthly: process.env.CREEM_PREMIUM_MONTHLY_PRODUCT_ID,
        yearly:  process.env.CREEM_PREMIUM_YEARLY_PRODUCT_ID,
      },
    };
    return map[plan]?.[billing] || null;
  }

  planForProductId(productId) {
    const ids = {
      [process.env.CREEM_PRO_MONTHLY_PRODUCT_ID]:      'pro',
      [process.env.CREEM_PRO_YEARLY_PRODUCT_ID]:       'pro',
      [process.env.CREEM_PREMIUM_MONTHLY_PRODUCT_ID]:  'premium',
      [process.env.CREEM_PREMIUM_YEARLY_PRODUCT_ID]:   'premium',
    };
    return ids[productId] || null;
  }

  async createCheckout(userId, plan, billing = 'monthly', baseUrl) {
    const productId = this._productIdForPlan(plan, billing);
    if (!productId) throw new Error(`Geen Creem-product geconfigureerd voor plan: ${plan} (${billing})`);

    const result = await creemPost('/checkouts', {
      product_id: productId,
      success_url: `${baseUrl}/dashboard.html?payment=success`,
      reference_id: userId,
      metadata: { userId, plan, billing },
    });

    if (!result.checkout_url) throw new Error('Creem gaf geen checkout-URL terug');
    return result.checkout_url;
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

  async saveSubscription(userId, creemSubscriptionId, creemCustomerId, plan) {
    await db.query(
      `INSERT INTO creem_subscriptions (user_id, creem_subscription_id, creem_customer_id, plan, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (creem_subscription_id) DO UPDATE
         SET status = 'active', updated_at = NOW()`,
      [userId, creemSubscriptionId, creemCustomerId, plan]
    );
  }

  async revokeSubscription(creemSubscriptionId) {
    const { rows } = await db.query(
      `UPDATE creem_subscriptions SET status = 'revoked', updated_at = NOW()
       WHERE creem_subscription_id = $1
       RETURNING user_id`,
      [creemSubscriptionId]
    );
    if (rows.length) {
      await this.upgradePlan(rows[0].user_id, 'free');
    }
  }
}

module.exports = new CreemPaymentAdapter();
