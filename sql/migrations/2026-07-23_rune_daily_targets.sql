-- =============================
-- RUNE: soft daily study targets on rune_settings
--   - daily_goal: motivational target — number of cards to review per day. Shown
--     as a progress indicator during study; does NOT limit the queue.
--   - daily_max_renew: soft ceiling — once the day's review count passes this,
--     the study UI warns (does NOT block further study).
-- Both NULL = user hasn't set them; app falls back to the DEFAULT_* constants.
-- Soft goals only — no study-queue enforcement.
-- Idempotent: guarded per-column so re-running is safe.
-- =============================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('rune_settings') AND name = 'daily_goal')
BEGIN
    ALTER TABLE rune_settings ADD daily_goal INT NULL;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('rune_settings') AND name = 'daily_max_renew')
BEGIN
    ALTER TABLE rune_settings ADD daily_max_renew INT NULL;
END
