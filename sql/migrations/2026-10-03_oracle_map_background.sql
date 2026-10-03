-- =============================================================================
-- Migration: Oracle — map background picture
-- Date: 2026-10-03
-- DB: GRIMOIRE-MAIN
-- Version: 202610031700
--
-- A map may carry one of the campaign's pictures as its background, drawn
-- under the grid and features on the Table and the player display.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('oracle_maps') AND name = 'background_image_id')
    ALTER TABLE oracle_maps ADD background_image_id UNIQUEIDENTIFIER NULL; -- oracle_images.id, no FK (the application clears it)
GO
