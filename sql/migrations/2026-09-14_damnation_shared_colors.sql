-- =============================================================================
-- Migration: Damnation — players may share a color
-- Date: 2026-09-14
-- DB: GRIMOIRE-MAIN
--
-- Colors are a way to tell cards apart, not an identity; two players may pick the same
-- one. Names stay unique per game.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'UX_damnation_players_color' AND object_id = OBJECT_ID('damnation_players'))
BEGIN
    DROP INDEX UX_damnation_players_color ON damnation_players;
END
GO
