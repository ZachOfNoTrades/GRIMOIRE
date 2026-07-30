-- =============================
-- RUNE: study-session preferences on rune_settings
--   - auto_advance_on_evaluate: auto-accept the AI-suggested rating and advance
--     to the next card after `auto_advance_seconds` when evaluating in a normal
--     (non-hands-free) study session.
--   - auto_advance_seconds: delay before the auto-advance fires (default 5s,
--     matching hands-free mode's historical hard-coded value).
--   - evaluation_sound_enabled: play a pleasant chime on evaluation, pitched to
--     the evaluated rating.
-- Idempotent: guarded per-column so re-running is safe.
-- =============================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('rune_settings') AND name = 'auto_advance_on_evaluate')
BEGIN
    ALTER TABLE rune_settings ADD auto_advance_on_evaluate BIT NOT NULL DEFAULT 0;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('rune_settings') AND name = 'auto_advance_seconds')
BEGIN
    ALTER TABLE rune_settings ADD auto_advance_seconds INT NOT NULL DEFAULT 5;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('rune_settings') AND name = 'evaluation_sound_enabled')
BEGIN
    ALTER TABLE rune_settings ADD evaluation_sound_enabled BIT NOT NULL DEFAULT 1;
END
