-- =============================================================================
-- Migration: Oracle — allow AI-invented creatures
-- Date: 2026-10-03
-- DB: GRIMOIRE-MAIN
-- Version: 202610031800
--
-- oracle_settings.ai_creatures: 0 (default) means every creature a generation
-- offers must come from the campaign's own material; 1 lets it invent them.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('oracle_settings') AND name = 'ai_creatures')
    ALTER TABLE oracle_settings ADD ai_creatures BIT NOT NULL DEFAULT 0;
GO
