-- =============================================================================
-- Migration: Damnation — commander damage is switched per game
-- Date: 2026-09-15
-- DB: GRIMOIRE-MAIN
--
-- damnation_sessions.commander_damage_enabled is set from the host's setting when a game is
-- created and can then be switched on the board; the host setting is only the default. Existing
-- games take their host's current setting.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('damnation_sessions') AND name = 'commander_damage_enabled'
)
BEGIN
    ALTER TABLE damnation_sessions ADD commander_damage_enabled BIT NOT NULL
        CONSTRAINT DF_damnation_sessions_commander_damage DEFAULT 1;
END
GO

UPDATE s SET commander_damage_enabled = ds.commander_damage_enabled
FROM damnation_sessions s
JOIN damnation_settings ds ON ds.user_id = s.host_user_id;
GO
