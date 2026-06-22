UPDATE users
SET email_verified = true
WHERE email_verified = false
  AND email_verification_token IS NULL;
