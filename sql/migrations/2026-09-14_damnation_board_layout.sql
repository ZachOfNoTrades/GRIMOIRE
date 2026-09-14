-- =============================================================================
-- Migration: Damnation — table layouts on the board
-- Date: 2026-09-14
-- DB: GRIMOIRE-MAIN
--
-- board_layout stores the arrangement the host picked for the board (a key from
-- lib/boardLayouts.ts); NULL means the automatic grid. Players fill the layout in seat
-- order, and the host reorders them, which is recorded as a 'reorder' event.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('damnation_sessions') AND name = 'board_layout'
)
BEGIN
    ALTER TABLE damnation_sessions ADD board_layout VARCHAR(20) NULL;
END
GO

IF EXISTS (
    SELECT * FROM sys.check_constraints
    WHERE name = 'CK_damnation_events_type' AND definition NOT LIKE '%reorder%'
)
BEGIN
    ALTER TABLE damnation_events DROP CONSTRAINT CK_damnation_events_type;
    ALTER TABLE damnation_events ADD CONSTRAINT CK_damnation_events_type CHECK (event_type IN
        ('join','claim','life','commander_damage','status','undo','kick','free_seat','start','reopen','rotate_code','end','reorder'));
END
GO
