ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified           BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email_2fa_enabled        BOOLEAN      NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS email_2fa_codes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       VARCHAR(6)  NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
