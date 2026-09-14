-- =============================================================================
-- Migration: Damnation — remember each host's table layout per player count
-- Date: 2026-09-14
-- DB: GRIMOIRE-MAIN
--
-- board_layouts is a small JSON object of player count -> layout key (e.g. {"4":"4-grid"}),
-- updated whenever the host picks a layout and applied when a game starts at, or changes to,
-- that player count.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('damnation_settings') AND name = 'board_layouts'
)
BEGIN
    ALTER TABLE damnation_settings ADD board_layouts NVARCHAR(400) NULL;
END
GO
