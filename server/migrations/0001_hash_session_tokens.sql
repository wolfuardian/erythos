-- session token plaintext-at-rest → SHA-256 hash at rest (refs #894)
-- Existing plaintext tokens are no longer valid after this migration.
-- All active sessions are invalidated; users must re-sign in.
-- Backfilling SHA-256 of existing ids is intentionally skipped — truncate
-- is safe because Phase D has only test users at this stage.
TRUNCATE TABLE sessions;
