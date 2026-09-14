-- =============================================================================
-- Migration: Damnation — players added by the host from the board
-- Date: 2026-09-14
-- DB: GRIMOIRE-MAIN
--
-- A manual player has no phone: token_hash stays NULL like a freed seat, but the seat
-- is NOT open for anyone with the join code to claim. is_manual separates the two.
-- The host clears it ("Hand to a phone") to make the seat claimable.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('damnation_players') AND name = 'is_manual'
)
BEGIN
    ALTER TABLE damnation_players
        ADD is_manual BIT NOT NULL CONSTRAINT DF_damnation_players_is_manual DEFAULT 0;
END
GO
