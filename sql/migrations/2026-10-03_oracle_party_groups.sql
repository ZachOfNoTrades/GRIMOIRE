-- =============================================================================
-- Migration: Oracle — party groups
-- Date: 2026-10-03
-- DB: GRIMOIRE-MAIN
-- Version: 202610031830
--
-- A group is a named token on a map that some party members belong to. Members
-- with no group are with the main party token. This replaces splitting a single
-- member off by giving it a map position (those columns stay, unused).
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='oracle_party_groups' AND xtype='U')
BEGIN
    CREATE TABLE oracle_party_groups (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        campaign_id UNIQUEIDENTIFIER NOT NULL,
        name NVARCHAR(60) NOT NULL,
        map_id UNIQUEIDENTIFIER NULL, -- oracle_maps.id, no FK
        map_x FLOAT NULL,
        map_y FLOAT NULL,
        ts_created DATETIME DEFAULT GETDATE(),

        CONSTRAINT FK_oracle_party_groups_campaign FOREIGN KEY (campaign_id) REFERENCES oracle_campaigns(id) ON DELETE CASCADE
    );
    CREATE INDEX IX_oracle_party_groups_campaign ON oracle_party_groups (campaign_id, ts_created);
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('oracle_party_members') AND name = 'group_id')
    ALTER TABLE oracle_party_members ADD group_id UNIQUEIDENTIFIER NULL; -- oracle_party_groups.id, no FK; NULL = with the main party
GO
