-- =============================================================================
-- Migration: Damnation — commander damage on/off setting
-- Date: 2026-09-14
-- DB: GRIMOIRE-MAIN
--
-- commander_damage_enabled lets a host hide commander damage tracking in their games (for
-- formats other than Commander). On by default; hosts without a settings row get it too.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('damnation_settings') AND name = 'commander_damage_enabled'
)
BEGIN
    ALTER TABLE damnation_settings ADD commander_damage_enabled BIT NOT NULL
        CONSTRAINT DF_damnation_settings_commander_damage DEFAULT 1;
END
GO
