-- =============================================================================
-- Migration: Damnation — wiki search is a server setting, not a per-host one
-- Date: 2026-09-14
-- DB: GRIMOIRE-MAIN
--
-- The wiki search address and embed choice now come from the DAMNATION_WIKI_SEARCH_TEMPLATE
-- and DAMNATION_WIKI_EMBED environment variables (defaulting to mtg.wiki, shown in-app), so the
-- per-host columns are dropped.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

DECLARE @constraint SYSNAME;
SELECT @constraint = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID('damnation_settings') AND c.name = 'wiki_embed';
IF @constraint IS NOT NULL EXEC ('ALTER TABLE damnation_settings DROP CONSTRAINT ' + @constraint);
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('damnation_settings') AND name = 'wiki_embed')
    ALTER TABLE damnation_settings DROP COLUMN wiki_embed;
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('damnation_settings') AND name = 'wiki_search_template')
    ALTER TABLE damnation_settings DROP COLUMN wiki_search_template;
GO
