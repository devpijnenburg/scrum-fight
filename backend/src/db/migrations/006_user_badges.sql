CREATE TABLE IF NOT EXISTS user_badges (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id   TEXT        NOT NULL,
  earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS user_badges_user_idx      ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS user_badges_earned_at_idx ON user_badges(earned_at DESC);
