-- =============================================================================
-- Migration: Oracle — the creature library
-- Date: 2026-10-05
-- DB: GRIMOIRE-MAIN
-- Version: 202610051200
--
-- oracle_creatures: creatures a DM can add to a campaign, kept once for everyone
-- rather than per campaign. `official_source` names the published book a creature
-- comes from and is the whole test of whether it is official: a creature written
-- by hand or by the AI leaves it NULL and is homebrew. The SRD rows are seeded by
-- scripts/seed-srd-creatures.mjs.
-- =============================================================================

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'oracle_creatures')
BEGIN
    CREATE TABLE oracle_creatures (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_oracle_creatures PRIMARY KEY DEFAULT NEWID(),
        slug NVARCHAR(100) NOT NULL,
        name NVARCHAR(120) NOT NULL,
        -- The published book, e.g. 'SRD 5.1'. NULL = homebrew.
        official_source NVARCHAR(120) NULL,
        license_url NVARCHAR(300) NULL,
        size NVARCHAR(30) NULL,
        creature_type NVARCHAR(60) NULL,
        alignment NVARCHAR(60) NULL,
        cr NVARCHAR(10) NOT NULL CONSTRAINT DF_oracle_creatures_cr DEFAULT '0',
        details NVARCHAR(1000) NULL,
        stats NVARCHAR(MAX) NULL,
        -- NULL for the shared library; set when a DM saves their own creature.
        user_id UNIQUEIDENTIFIER NULL,
        ts_created DATETIME2 NOT NULL CONSTRAINT DF_oracle_creatures_created DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UX_oracle_creatures_slug_user')
    CREATE UNIQUE INDEX UX_oracle_creatures_slug_user ON oracle_creatures (slug, user_id);
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_oracle_creatures_name')
    CREATE INDEX IX_oracle_creatures_name ON oracle_creatures (name);
GO
