-- =============================================================================
-- Migration: Damnation — edit a player's name or color from the board
-- Date: 2026-09-14
-- DB: GRIMOIRE-MAIN
--
-- The board adds a player with a placeholder name and a free color, then the host clicks the
-- name or color on the card to change it. Each change is recorded as an 'edit_player' event.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF EXISTS (
    SELECT * FROM sys.check_constraints
    WHERE name = 'CK_damnation_events_type' AND definition NOT LIKE '%edit_player%'
)
BEGIN
    ALTER TABLE damnation_events DROP CONSTRAINT CK_damnation_events_type;
    ALTER TABLE damnation_events ADD CONSTRAINT CK_damnation_events_type CHECK (event_type IN
        ('join','claim','life','commander_damage','status','undo','kick','free_seat','start','reopen','rotate_code','end','reorder','setup','edit_player'));
END
GO
