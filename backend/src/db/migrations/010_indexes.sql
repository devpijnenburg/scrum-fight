-- Indexes for the most common lookups that were missing.

-- Room history (GET /api/rooms/:id/history) and room deletion cascades
CREATE INDEX IF NOT EXISTS round_history_room_created_idx ON round_history (room_id, created_at DESC);

-- Joins from user_votes to round_history (stats, badges) and cascades
CREATE INDEX IF NOT EXISTS user_votes_round_id_idx ON user_votes (round_id);

-- Dashboard room list and plan-limit counts
CREATE INDEX IF NOT EXISTS rooms_owner_idx ON rooms (owner_id) WHERE owner_id IS NOT NULL;

-- Guest-room cleanup job
CREATE INDEX IF NOT EXISTS rooms_guest_last_active_idx ON rooms (last_active) WHERE is_guest = TRUE;

-- Email 2FA code lookup
CREATE INDEX IF NOT EXISTS email_2fa_codes_user_idx ON email_2fa_codes (user_id);

-- Email verification link lookup
CREATE INDEX IF NOT EXISTS users_email_verification_token_idx
  ON users (email_verification_token) WHERE email_verification_token IS NOT NULL;
