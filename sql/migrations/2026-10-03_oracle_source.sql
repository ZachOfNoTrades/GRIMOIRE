-- =============================================================================
-- Migration: Oracle — where an entry comes from
-- Date: 2026-10-03
-- DB: GRIMOIRE-MAIN
-- Version: 202610031820
--
-- oracle_entities.source: the published book and page, the adventure, or
-- "AI-generated". Shown in the footer of an entry's details pane.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('oracle_entities') AND name = 'source')
    ALTER TABLE oracle_entities ADD source NVARCHAR(200) NULL;
GO
