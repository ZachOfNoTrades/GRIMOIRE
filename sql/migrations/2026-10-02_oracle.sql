-- =============================================================================
-- Migration: Oracle — DM toolkit for running tabletop sessions
-- Date: 2026-10-02
-- DB: GRIMOIRE-MAIN
--
-- A signed-in DM runs a campaign from the table page; players watch a public,
-- read-only display (map on the left, a reference panel on the right) opened
-- with the campaign's display code.
--
-- Cascade layout (SQL Server allows only ONE cascade path into a table, error 1785):
--   users -> oracle_settings
--   users -> oracle_campaigns -> { oracle_scenes, oracle_maps, oracle_entities,
--                                  oracle_events, oracle_images, oracle_chips }
--   oracle_entities -> oracle_knowledge
-- Every other reference between those tables (a campaign's current scene / active
-- map / panel, an entity's map and image, an event's entity) is a plain column with
-- no foreign key; the application clears it when the target is deleted.
-- =============================================================================

-- Filtered indexes require these; sqlcmd defaults QUOTED_IDENTIFIER to OFF
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- =============================
-- Oracle Campaigns
-- =============================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='oracle_campaigns' AND xtype='U')
BEGIN
    CREATE TABLE oracle_campaigns (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        user_id UNIQUEIDENTIFIER NOT NULL,
        name NVARCHAR(120) NOT NULL,
        world NVARCHAR(MAX) NOT NULL DEFAULT '', -- tone and setting notes fed to every generation
        draft NVARCHAR(MAX) NOT NULL DEFAULT '', -- the DM's rough session notes, as pasted
        display_code VARCHAR(8) NOT NULL, -- opens the public player display
        current_scene_id UNIQUEIDENTIFIER NULL, -- oracle_scenes.id, no FK (see cascade layout)
        active_map_id UNIQUEIDENTIFIER NULL, -- oracle_maps.id, no FK
        panel_kind VARCHAR(10) NULL, -- NULL = empty panel, 'entity' or 'image'
        panel_entity_id UNIQUEIDENTIFIER NULL, -- oracle_entities.id, no FK
        panel_image_id UNIQUEIDENTIFIER NULL, -- oracle_images.id, no FK
        display_blank BIT NOT NULL DEFAULT 0, -- 1 = the player display shows nothing
        chips_paused BIT NOT NULL DEFAULT 0, -- 1 = suggestions stop cycling
        version INT NOT NULL DEFAULT 0, -- bumped by every change the player display can see
        ts_created DATETIME DEFAULT GETDATE(),
        ts_updated DATETIME DEFAULT GETDATE(),

        CONSTRAINT CK_oracle_campaigns_panel_kind CHECK (panel_kind IS NULL OR panel_kind IN ('entity','image')),
        CONSTRAINT FK_oracle_campaigns_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX UX_oracle_campaigns_display_code ON oracle_campaigns (display_code);
    CREATE INDEX IX_oracle_campaigns_user ON oracle_campaigns (user_id, ts_updated);
END
GO

-- =============================
-- Oracle Scenes
-- =============================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='oracle_scenes' AND xtype='U')
BEGIN
    CREATE TABLE oracle_scenes (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        campaign_id UNIQUEIDENTIFIER NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        title NVARCHAR(160) NOT NULL,
        summary NVARCHAR(500) NOT NULL DEFAULT '',
        is_done BIT NOT NULL DEFAULT 0,
        ts_created DATETIME DEFAULT GETDATE(),
        ts_updated DATETIME DEFAULT GETDATE(),

        CONSTRAINT FK_oracle_scenes_campaign FOREIGN KEY (campaign_id) REFERENCES oracle_campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IX_oracle_scenes_campaign ON oracle_scenes (campaign_id, sort_order);
END
GO

-- =============================
-- Oracle Maps
-- =============================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='oracle_maps' AND xtype='U')
BEGIN
    CREATE TABLE oracle_maps (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        campaign_id UNIQUEIDENTIFIER NOT NULL,
        name NVARCHAR(120) NOT NULL,
        data NVARCHAR(MAX) NOT NULL, -- JSON: { width, height, features[] }
        undo_stack NVARCHAR(MAX) NOT NULL DEFAULT '[]', -- JSON array of earlier `data` values, newest last
        party_x FLOAT NOT NULL DEFAULT 0,
        party_y FLOAT NOT NULL DEFAULT 0,
        vision_radius FLOAT NOT NULL DEFAULT 150,
        explored NVARCHAR(MAX) NOT NULL DEFAULT '[]', -- JSON array of { x, y, r } circles the party has seen
        ts_created DATETIME DEFAULT GETDATE(),
        ts_updated DATETIME DEFAULT GETDATE(),

        CONSTRAINT FK_oracle_maps_campaign FOREIGN KEY (campaign_id) REFERENCES oracle_campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IX_oracle_maps_campaign ON oracle_maps (campaign_id, ts_created);
END
GO

-- =============================
-- Oracle Entities (creatures, people, places)
-- =============================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='oracle_entities' AND xtype='U')
BEGIN
    CREATE TABLE oracle_entities (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        campaign_id UNIQUEIDENTIFIER NOT NULL,
        kind VARCHAR(10) NOT NULL, -- creature, person or place
        name NVARCHAR(120) NOT NULL,
        details NVARCHAR(1000) NOT NULL DEFAULT '', -- what the players can be shown
        attitude VARCHAR(10) NOT NULL DEFAULT 'neutral', -- friendly, neutral or hostile
        stats NVARCHAR(MAX) NULL, -- JSON stat block; NULL for anything that is not a creature
        dm_notes NVARCHAR(MAX) NOT NULL DEFAULT '', -- never sent to the player display
        map_id UNIQUEIDENTIFIER NULL, -- oracle_maps.id, no FK; NULL = not placed on a map
        map_x FLOAT NULL,
        map_y FLOAT NULL,
        image_id UNIQUEIDENTIFIER NULL, -- oracle_images.id, no FK
        ts_created DATETIME DEFAULT GETDATE(),
        ts_updated DATETIME DEFAULT GETDATE(),

        CONSTRAINT CK_oracle_entities_kind CHECK (kind IN ('creature','person','place')),
        CONSTRAINT CK_oracle_entities_attitude CHECK (attitude IN ('friendly','neutral','hostile')),
        CONSTRAINT FK_oracle_entities_campaign FOREIGN KEY (campaign_id) REFERENCES oracle_campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IX_oracle_entities_campaign ON oracle_entities (campaign_id, name);
END
GO

-- =============================
-- Oracle Knowledge (what the players have learned about an entity)
-- =============================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='oracle_knowledge' AND xtype='U')
BEGIN
    CREATE TABLE oracle_knowledge (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        entity_id UNIQUEIDENTIFIER NOT NULL,
        fact NVARCHAR(600) NOT NULL,
        skill VARCHAR(20) NULL, -- the check that earned it; NULL = written by the DM
        tier VARCHAR(10) NULL, -- common, useful or secret
        ts_created DATETIME DEFAULT GETDATE(),

        CONSTRAINT FK_oracle_knowledge_entity FOREIGN KEY (entity_id) REFERENCES oracle_entities(id) ON DELETE CASCADE
    );

    CREATE INDEX IX_oracle_knowledge_entity ON oracle_knowledge (entity_id, ts_created);
END
GO

-- =============================
-- Oracle Events (session log and per-entity history)
-- =============================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='oracle_events' AND xtype='U')
BEGIN
    CREATE TABLE oracle_events (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        campaign_id UNIQUEIDENTIFIER NOT NULL,
        entity_id UNIQUEIDENTIFIER NULL, -- oracle_entities.id, no FK; NULL = a general log note
        scene_title NVARCHAR(160) NULL, -- the scene that was live, copied so it survives scene edits
        body NVARCHAR(1000) NOT NULL,
        ts_created DATETIME DEFAULT GETDATE(),

        CONSTRAINT FK_oracle_events_campaign FOREIGN KEY (campaign_id) REFERENCES oracle_campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IX_oracle_events_campaign ON oracle_events (campaign_id, ts_created);
    CREATE INDEX IX_oracle_events_entity ON oracle_events (entity_id, ts_created) WHERE entity_id IS NOT NULL;
END
GO

-- =============================
-- Oracle Images (reference pictures for the player display)
-- =============================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='oracle_images' AND xtype='U')
BEGIN
    CREATE TABLE oracle_images (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        campaign_id UNIQUEIDENTIFIER NOT NULL,
        caption NVARCHAR(120) NOT NULL,
        file_name VARCHAR(80) NOT NULL, -- <id>.<ext> under storage/oracle-uploads/<campaign id>/
        content_type VARCHAR(40) NOT NULL,
        ts_created DATETIME DEFAULT GETDATE(),

        CONSTRAINT FK_oracle_images_campaign FOREIGN KEY (campaign_id) REFERENCES oracle_campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IX_oracle_images_campaign ON oracle_images (campaign_id, ts_created);
END
GO

-- =============================
-- Oracle Chips (the suggestion banner's items)
-- =============================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='oracle_chips' AND xtype='U')
BEGIN
    CREATE TABLE oracle_chips (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        campaign_id UNIQUEIDENTIFIER NOT NULL,
        label NVARCHAR(60) NOT NULL,
        content NVARCHAR(MAX) NOT NULL, -- JSON, prepared together with the label: a text chip's answers, or a picture chip's image and suggested use
        is_pinned BIT NOT NULL DEFAULT 0, -- a pinned chip stays until it is used
        is_queued BIT NOT NULL DEFAULT 0, -- 1 = generated ahead of time, not on the banner yet
        ts_created DATETIME DEFAULT GETDATE(),
        ts_shown DATETIME NULL, -- when it reached the banner; orders the banner oldest first

        CONSTRAINT FK_oracle_chips_campaign FOREIGN KEY (campaign_id) REFERENCES oracle_campaigns(id) ON DELETE CASCADE
    );

    CREATE INDEX IX_oracle_chips_campaign ON oracle_chips (campaign_id, is_queued, ts_shown);
END
GO

-- =============================
-- Oracle Settings (per DM)
-- =============================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='oracle_settings' AND xtype='U')
BEGIN
    CREATE TABLE oracle_settings (
        user_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        chip_seconds INT NOT NULL DEFAULT 15, -- the banner brings on one new suggestion every this many seconds
        banner_images BIT NOT NULL DEFAULT 1, -- 1 = the banner mixes in reference pictures
        ts_created DATETIME DEFAULT GETDATE(),
        ts_updated DATETIME DEFAULT GETDATE(),

        CONSTRAINT CK_oracle_settings_chip_seconds CHECK (chip_seconds BETWEEN 5 AND 120),
        CONSTRAINT FK_oracle_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
END
GO

-- =============================
-- Module registration
-- =============================
IF NOT EXISTS (SELECT * FROM modules WHERE slug = 'oracle')
BEGIN
    INSERT INTO modules (id, name, slug, description, icon) VALUES
    ('A0000000-0000-0000-0000-000000000007', 'Oracle', 'oracle', 'DM toolkit for running tabletop sessions', 'Dices');
END
GO
