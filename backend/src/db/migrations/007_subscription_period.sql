ALTER TABLE creem_subscriptions
  ADD COLUMN IF NOT EXISTS current_period_end_date TIMESTAMPTZ;
