CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  oauth_provider VARCHAR(50),
  oauth_id      VARCHAR(255),
  plan          VARCHAR(20)  NOT NULL DEFAULT 'free',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_idx
  ON users (oauth_provider, oauth_id)
  WHERE oauth_provider IS NOT NULL;

CREATE TABLE IF NOT EXISTS rooms (
  id          VARCHAR(8)   PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  owner_id    UUID         REFERENCES users(id) ON DELETE SET NULL,
  method      VARCHAR(50)  NOT NULL,
  is_guest    BOOLEAN      NOT NULL DEFAULT FALSE,
  last_active TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS round_history (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    VARCHAR(8)  REFERENCES rooms(id) ON DELETE CASCADE,
  votes      JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
