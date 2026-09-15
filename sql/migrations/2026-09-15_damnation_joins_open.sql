-- =============================================================================
-- Migration: Damnation — joining can be opened during a game
-- Date: 2026-09-15
-- DB: GRIMOIRE-MAIN
--
-- damnation_sessions.joins_open lets players join a game that is under way (status active)
-- without taking it back to the lobby. Joining is open while status = lobby or joins_open = 1.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('damnation_sessions') AND name = 'joins_open'
)
BEGIN
    ALTER TABLE damnation_sessions ADD joins_open BIT NOT NULL
        CONSTRAINT DF_damnation_sessions_joins_open DEFAULT 0;
END
GO
