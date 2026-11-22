-- Paid subscriptions (payment provider: Creem) and the webhook events
-- already processed.
--
-- users.plan stays the single source of truth for limits; it is derived
-- from the subscriptions below whenever one of them changes.

CREATE TABLE IF NOT EXISTS subscriptions (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_subscription_id VARCHAR(255) NOT NULL UNIQUE,
  provider_customer_id     VARCHAR(255),
  plan                     VARCHAR(20)  NOT NULL,
  billing_period           VARCHAR(20),
  status                   VARCHAR(30)  NOT NULL,
  current_period_end       TIMESTAMPTZ,
  -- Time of the newest provider event applied, so a late or repeated
  -- delivery can never overwrite newer state.
  last_event_at            TIMESTAMPTZ,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);

-- One row per webhook event id: a redelivered event is processed once.
CREATE TABLE IF NOT EXISTS payment_events (
  event_id    VARCHAR(255) PRIMARY KEY,
  event_type  VARCHAR(100) NOT NULL,
  received_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
