-- =============================================================================
-- Migration: Oracle — party members
-- Date: 2026-10-03
-- DB: GRIMOIRE-MAIN
-- Version: 202610031500
--
-- The campaign's party as a list of player characters (name and level). Player
-- count and levels feed the encounter builder; a member with a map position is
-- split off from the party token and sees the map from where it stands.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='oracle_party_members' AND xtype='U')
BEGIN
    CREATE TABLE oracle_party_members (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        campaign_id UNIQUEIDENTIFIER NOT NULL,
        name NVARCHAR(60) NOT NULL,
        level TINYINT NOT NULL DEFAULT 1, -- 1-20
        map_id UNIQUEIDENTIFIER NULL, -- set while the member stands apart from the party token
        map_x FLOAT NULL,
        map_y FLOAT NULL,
        ts_created DATETIME DEFAULT GETDATE(),

        CONSTRAINT FK_oracle_party_members_campaign FOREIGN KEY (campaign_id) REFERENCES oracle_campaigns(id) ON DELETE CASCADE
    );
    CREATE INDEX IX_oracle_party_members_campaign ON oracle_party_members (campaign_id, ts_created);
END
GO
