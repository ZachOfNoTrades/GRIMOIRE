-- =============================================================================
-- Migration: Oracle — three levels of what the players can see
-- Date: 2026-10-05
-- DB: GRIMOIRE-MAIN
-- Version: 202610051500
--
-- oracle_entities.visibility replaces is_revealed, which could only say "on the
-- players' map" or "not":
--   hidden   — never drawn for the players, even with the party standing on it
--   sight    — drawn when it is inside what the party can see
--   revealed — always drawn, wherever the party is
-- Everything previously revealed becomes 'revealed'; everything else 'hidden',
-- which is what it was.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('oracle_entities') AND name = 'visibility')
BEGIN
    ALTER TABLE oracle_entities ADD visibility NVARCHAR(10) NOT NULL
        CONSTRAINT DF_oracle_entities_visibility DEFAULT 'hidden';
END
GO

UPDATE oracle_entities SET visibility = 'revealed' WHERE is_revealed = 1 AND visibility = 'hidden';
GO

IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_oracle_entities_visibility')
    ALTER TABLE oracle_entities ADD CONSTRAINT CK_oracle_entities_visibility
        CHECK (visibility IN ('hidden', 'sight', 'revealed'));
GO

-- is_revealed is left in place, unread, so this migration can be undone.
