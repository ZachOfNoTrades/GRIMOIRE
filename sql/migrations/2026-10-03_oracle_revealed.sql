-- =============================================================================
-- Migration: Oracle — an entry the DM shows on the player map by hand
-- Date: 2026-10-03
-- DB: GRIMOIRE-MAIN
-- Version: 202610031810
--
-- oracle_entities.is_revealed: 1 puts the entry on the player's map even when it
-- is outside the party's sight.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('oracle_entities') AND name = 'is_revealed')
    ALTER TABLE oracle_entities ADD is_revealed BIT NOT NULL DEFAULT 0;
GO
