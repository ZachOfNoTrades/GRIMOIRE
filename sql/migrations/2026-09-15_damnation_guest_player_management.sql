-- =============================================================================
-- Migration: Damnation — guests can manage players
-- Date: 2026-09-15
-- DB: GRIMOIRE-MAIN
--
-- damnation_sessions.guests_manage_players, switched per game in the board's game setup, lets
-- players on their phones add players, rename and recolor them, move them and remove them, the
-- way the host can on the board. Off by default.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('damnation_sessions') AND name = 'guests_manage_players'
)
BEGIN
    ALTER TABLE damnation_sessions ADD guests_manage_players BIT NOT NULL
        CONSTRAINT DF_damnation_sessions_guests_manage_players DEFAULT 0;
END
GO
