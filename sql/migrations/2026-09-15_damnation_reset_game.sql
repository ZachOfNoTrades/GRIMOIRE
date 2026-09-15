-- =============================================================================
-- Migration: Damnation — reset a game from the board
-- Date: 2026-09-15
-- DB: GRIMOIRE-MAIN
--
-- Reset game (the board's menu) puts every player back to the starting life and clears commander
-- damage and anyone's out status, keeping the players and settings. It is recorded as a 'reset'
-- event.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF EXISTS (
    SELECT * FROM sys.check_constraints
    WHERE name = 'CK_damnation_events_type' AND definition NOT LIKE '%reset%'
)
BEGIN
    ALTER TABLE damnation_events DROP CONSTRAINT CK_damnation_events_type;
    ALTER TABLE damnation_events ADD CONSTRAINT CK_damnation_events_type CHECK (event_type IN
        ('join','claim','life','commander_damage','status','undo','kick','free_seat','start','reopen','rotate_code','end','reorder','setup','edit_player','reset'));
END
GO
