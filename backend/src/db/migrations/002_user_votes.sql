-- Track individual authenticated user votes for personal statistics

CREATE TABLE IF NOT EXISTS user_votes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id    VARCHAR(8)  NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  round_id   UUID        NOT NULL REFERENCES round_history(id) ON DELETE CASCADE,
  value      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_votes_user_id_idx    ON user_votes(user_id);
CREATE INDEX IF NOT EXISTS user_votes_created_at_idx ON user_votes(created_at);
