-- =============================================================================
-- Migration: Oracle — a Claude model per kind of generation
-- Date: 2026-10-02
-- DB: GRIMOIRE-MAIN
-- Version: 202610021500
--
-- oracle_settings.models holds JSON mapping each generation task (world, build,
-- map, chips, ask, fact, outline) to "haiku", "sonnet" or "opus". Missing or
-- unknown entries fall back to haiku in the application.
-- =============================================================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('oracle_settings') AND name = 'models')
BEGIN
    ALTER TABLE oracle_settings ADD models NVARCHAR(400) NOT NULL DEFAULT '{}'; -- JSON: generation task -> model
END
GO
