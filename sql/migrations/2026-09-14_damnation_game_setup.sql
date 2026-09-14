-- =============================================================================
-- Migration: Damnation — game setup on the board
-- Date: 2026-09-14
-- DB: GRIMOIRE-MAIN
--
-- Starting life and the player count are now set on the board while joining is open,
-- rather than only when the game is created. Each change is recorded as a 'setup' event.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF EXISTS (
    SELECT * FROM sys.check_constraints
    WHERE name = 'CK_damnation_events_type' AND definition NOT LIKE '%setup%'
)
BEGIN
    ALTER TABLE damnation_events DROP CONSTRAINT CK_damnation_events_type;
    ALTER TABLE damnation_events ADD CONSTRAINT CK_damnation_events_type CHECK (event_type IN
        ('join','claim','life','commander_damage','status','undo','kick','free_seat','start','reopen','rotate_code','end','reorder','setup'));
END
GO
