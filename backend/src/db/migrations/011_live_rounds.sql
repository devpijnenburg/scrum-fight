-- The round in progress per room, so a restart (deploy) does not lose the
-- votes of a round that has not been revealed yet. One row per room,
-- written by the realtime layer; see domains/game/liveRoundRepository.js.
CREATE TABLE IF NOT EXISTS live_rounds (
  room_id    VARCHAR(8)  PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  state      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS live_rounds_updated_at_idx ON live_rounds (updated_at);
