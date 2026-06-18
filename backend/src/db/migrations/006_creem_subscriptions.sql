CREATE TABLE IF NOT EXISTS creem_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creem_subscription_id VARCHAR(255) UNIQUE,
  creem_customer_id VARCHAR(255),
  plan VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_creem_subs_user_id ON creem_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_creem_subs_subscription_id ON creem_subscriptions(creem_subscription_id);
