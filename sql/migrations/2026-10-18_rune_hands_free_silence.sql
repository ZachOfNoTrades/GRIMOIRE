-- =============================
-- RUNE: hands-free silence window on rune_settings
--   - hands_free_silence_seconds: silence after speech that ends a hands-free
--     recording. NULL = use the app default.
-- Idempotent: guarded so re-running is safe.
-- =============================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('rune_settings') AND name = 'hands_free_silence_seconds')
BEGIN
    ALTER TABLE rune_settings ADD hands_free_silence_seconds DECIMAL(3,1) NULL;
END
