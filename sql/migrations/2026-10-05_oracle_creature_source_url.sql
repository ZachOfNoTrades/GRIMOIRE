-- =============================================================================
-- Migration: Oracle — a link to the creature's page in its source
-- Date: 2026-10-05
-- DB: GRIMOIRE-MAIN
-- Version: 202610051330
--
-- oracle_creatures.source_url: the creature's own page in the published source,
-- so the DM can read the full entry rather than only the summary kept here.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('oracle_creatures') AND name = 'source_url')
    ALTER TABLE oracle_creatures ADD source_url NVARCHAR(400) NULL;
GO
