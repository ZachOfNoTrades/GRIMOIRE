-- =============================
-- GRIMOIRE Main Database Initialization Script
-- Version: 202610031500 (Oracle party members)
-- =============================

BEGIN TRANSACTION MainDbInitialization;
BEGIN TRY

    -- =============================
    -- Users
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
    BEGIN
        CREATE TABLE users (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            email NVARCHAR(255) UNIQUE NOT NULL,
            name NVARCHAR(255) NOT NULL,
            global_admin BIT NOT NULL DEFAULT 0,
            generation_limit INT NOT NULL DEFAULT 1, -- 0 = unlimited
            enabled BIT NOT NULL DEFAULT 1,
            ts_created DATETIME DEFAULT GETDATE(),
            ts_updated DATETIME DEFAULT GETDATE()
        );
    END

    -- =============================
    -- Modules
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='modules' AND xtype='U')
    BEGIN
        CREATE TABLE modules (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            name NVARCHAR(255) NOT NULL,
            slug NVARCHAR(100) UNIQUE NOT NULL,
            description NVARCHAR(MAX) NULL,
            icon NVARCHAR(100) NULL,
            enabled BIT NOT NULL DEFAULT 1,
            ts_created DATETIME DEFAULT GETDATE(),
            ts_updated DATETIME DEFAULT GETDATE()
        );
    END

    -- =============================
    -- Generation Log (rate limiting + usage tracking)
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='generation_log' AND xtype='U')
    BEGIN
        CREATE TABLE generation_log (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            endpoint NVARCHAR(255) NOT NULL,
            ts_created DATETIME DEFAULT GETDATE(),

            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX IX_generation_log_user_created ON generation_log (user_id, ts_created);
    END

    -- =============================
    -- User API Keys
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_api_keys' AND xtype='U')
    BEGIN
        CREATE TABLE user_api_keys (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            name NVARCHAR(100) NOT NULL,
            key_prefix NVARCHAR(16) NOT NULL,
            key_hash VARBINARY(32) NOT NULL,
            ts_created DATETIME DEFAULT GETDATE(),
            ts_last_used DATETIME NULL,
            revoked BIT NOT NULL DEFAULT 0,
            ts_revoked DATETIME NULL,

            FOREIGN KEY (user_id) REFERENCES users(id),
            CONSTRAINT UQ_user_api_keys_hash UNIQUE (key_hash)
        );

        -- Filtered unique so a user can reuse a name after revoking the old key.
        CREATE UNIQUE INDEX UX_user_api_keys_active_name
            ON user_api_keys (user_id, name) WHERE revoked = 0;

        CREATE INDEX IX_user_api_keys_user_active
            ON user_api_keys (user_id) WHERE revoked = 0;
    END

    -- =============================
    -- User Preferences (per-user, app-wide)
    -- =============================
    -- One row per user, created on first write. A user with no row uses the
    -- application defaults (see nextjs/types/preferences.ts), so reads must
    -- tolerate the row being absent rather than requiring a backfill.
    -- Module-scoped preferences stay in their own module DB (e.g.
    -- forage_user_settings); this table is only for settings that apply to the
    -- whole app, like the theme.
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_preferences' AND xtype='U')
    BEGIN
        CREATE TABLE user_preferences (
            user_id UNIQUEIDENTIFIER PRIMARY KEY,
            theme NVARCHAR(10) NOT NULL DEFAULT 'auto', -- auto | light | dark
            ts_created DATETIME DEFAULT GETDATE(),
            ts_updated DATETIME DEFAULT GETDATE(),

            FOREIGN KEY (user_id) REFERENCES users(id),
            CONSTRAINT chk_user_preferences_theme CHECK (theme IN ('auto','light','dark'))
        );
    END

    -- =============================
    -- User Module Access (per-user allow-list)
    -- =============================
    -- Empty table for a user == full access ("give everyone everything" default);
    -- one or more rows restricts that user to exactly the granted modules. A
    -- global_admin always sees every module regardless. See lib/moduleAccess.ts.
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_modules' AND xtype='U')
    BEGIN
        CREATE TABLE user_modules (
            user_id UNIQUEIDENTIFIER NOT NULL,
            module_id UNIQUEIDENTIFIER NOT NULL,
            ts_created DATETIME DEFAULT GETDATE(),

            CONSTRAINT PK_user_modules PRIMARY KEY (user_id, module_id),
            CONSTRAINT FK_user_modules_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT FK_user_modules_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
        );
    END

    -- =============================
    -- Google Refresh Tokens (notification email delivery)
    -- =============================
    -- Notification emails are sent through the recipient's own Gmail account, using the
    -- refresh token captured when they sign in with Google (gmail.send scope). Kept out of
    -- the users table on purpose: this is a live credential, and users rows are handed to
    -- the settings UI and the user API. See lib/googleMail.ts.
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_google_tokens' AND xtype='U')
    BEGIN
        CREATE TABLE user_google_tokens (
            user_id UNIQUEIDENTIFIER NOT NULL,
            refresh_token NVARCHAR(512) NOT NULL,
            -- Space-separated scope list Google actually granted, so the app can tell an
            -- account that consented to gmail.send from one that only granted sign-in.
            scope NVARCHAR(1000) NULL,
            ts_created DATETIME2 NOT NULL CONSTRAINT DF_user_google_tokens_ts_created DEFAULT SYSUTCDATETIME(),
            ts_updated DATETIME2 NOT NULL CONSTRAINT DF_user_google_tokens_ts_updated DEFAULT SYSUTCDATETIME(),

            CONSTRAINT PK_user_google_tokens PRIMARY KEY (user_id),
            CONSTRAINT FK_user_google_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    END

    -- =============================
    -- Damnation Settings (per host)
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='damnation_settings' AND xtype='U')
    BEGIN
        CREATE TABLE damnation_settings (
            user_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
            commander_damage_enabled BIT NOT NULL CONSTRAINT DF_damnation_settings_commander_damage DEFAULT 1, -- default for this host's new games; each game can switch it on the board
            board_layouts NVARCHAR(400) NULL, -- JSON player count -> last table layout key the host picked, e.g. {"4":"4-grid"}
            ts_created DATETIME DEFAULT GETDATE(),
            ts_updated DATETIME DEFAULT GETDATE(),

            CONSTRAINT FK_damnation_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    END

    -- =============================
    -- Damnation Sessions
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='damnation_sessions' AND xtype='U')
    BEGIN
        CREATE TABLE damnation_sessions (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            host_user_id UNIQUEIDENTIFIER NOT NULL,
            join_code VARCHAR(8) NULL, -- NULL once finished; unique among live sessions only
            starting_life INT NOT NULL DEFAULT 40,
            max_seats INT NOT NULL DEFAULT 4,
            status VARCHAR(10) NOT NULL DEFAULT 'lobby', -- lobby = joins open, active = joins closed, finished
            version INT NOT NULL DEFAULT 0, -- bumped by every mutation; doubles as the per-session write lock
            board_layout VARCHAR(20) NULL, -- board arrangement key (lib/boardLayouts.ts); NULL = the first layout for the count
            commander_damage_enabled BIT NOT NULL CONSTRAINT DF_damnation_sessions_commander_damage DEFAULT 1, -- set from the host's setting at creation, switchable on the board
            joins_open BIT NOT NULL CONSTRAINT DF_damnation_sessions_joins_open DEFAULT 0, -- joining opened during a game (status active); lobby is always open
            guests_manage_players BIT NOT NULL CONSTRAINT DF_damnation_sessions_guests_manage_players DEFAULT 0, -- players on phones may add, edit, move and remove players
            ts_created DATETIME DEFAULT GETDATE(),
            ts_updated DATETIME DEFAULT GETDATE(),
            ts_finished DATETIME NULL,

            CONSTRAINT CK_damnation_sessions_status CHECK (status IN ('lobby','active','finished')),
            CONSTRAINT CK_damnation_sessions_starting_life CHECK (starting_life BETWEEN 1 AND 999),
            CONSTRAINT CK_damnation_sessions_max_seats CHECK (max_seats BETWEEN 2 AND 6),
            CONSTRAINT FK_damnation_sessions_host FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        -- Codes are recycled after a session ends, so uniqueness only covers live codes
        CREATE UNIQUE INDEX UX_damnation_sessions_join_code ON damnation_sessions (join_code) WHERE join_code IS NOT NULL;
        CREATE INDEX IX_damnation_sessions_host ON damnation_sessions (host_user_id, ts_created);
    END

    -- =============================
    -- Damnation Players
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='damnation_players' AND xtype='U')
    BEGIN
        CREATE TABLE damnation_players (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            session_id UNIQUEIDENTIFIER NOT NULL,
            seat INT NOT NULL,
            display_name NVARCHAR(24) NOT NULL,
            color_key VARCHAR(20) NOT NULL, -- palette key (see lib/constants.ts), never raw CSS; may be shared
            token_hash VARBINARY(32) NULL, -- SHA-256 of the guest token; NULL = seat freed by the host, claimable
            life_total INT NOT NULL,
            conceded BIT NOT NULL DEFAULT 0,
            eliminated_override BIT NULL, -- NULL = derive from life/commander damage, 1 = forced out, 0 = forced alive
            is_manual BIT NOT NULL CONSTRAINT DF_damnation_players_is_manual DEFAULT 0, -- 1 = added by the host from the board, no phone; not claimable until handed to a phone
            kicked BIT NOT NULL DEFAULT 0, -- 1 = removed from the game; seat, color and name are released
            ts_created DATETIME DEFAULT GETDATE(),
            ts_updated DATETIME DEFAULT GETDATE(),

            CONSTRAINT CK_damnation_players_seat CHECK (seat BETWEEN 1 AND 6),
            CONSTRAINT CK_damnation_players_life CHECK (life_total BETWEEN -999 AND 999),
            CONSTRAINT FK_damnation_players_session FOREIGN KEY (session_id) REFERENCES damnation_sessions(id) ON DELETE CASCADE
        );

        -- Seat and name are unique among players still in the game (kicked rows keep history); colors may be shared
        CREATE UNIQUE INDEX UX_damnation_players_seat ON damnation_players (session_id, seat) WHERE kicked = 0;
        CREATE UNIQUE INDEX UX_damnation_players_name ON damnation_players (session_id, display_name) WHERE kicked = 0;
        CREATE UNIQUE INDEX UX_damnation_players_token ON damnation_players (token_hash) WHERE token_hash IS NOT NULL;
    END

    -- =============================
    -- Damnation Commander Damage
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='damnation_commander_damage' AND xtype='U')
    BEGIN
        CREATE TABLE damnation_commander_damage (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            session_id UNIQUEIDENTIFIER NOT NULL,
            source_player_id UNIQUEIDENTIFIER NOT NULL, -- whose commander dealt the damage
            target_player_id UNIQUEIDENTIFIER NOT NULL, -- who took it
            damage INT NOT NULL DEFAULT 0,
            ts_updated DATETIME DEFAULT GETDATE(),

            CONSTRAINT UK_damnation_commander_damage_pair UNIQUE (source_player_id, target_player_id), -- one grid cell per ordered pair
            CONSTRAINT CK_damnation_commander_damage_range CHECK (damage BETWEEN 0 AND 999),
            CONSTRAINT CK_damnation_commander_damage_self CHECK (source_player_id <> target_player_id),
            CONSTRAINT FK_damnation_commander_damage_session FOREIGN KEY (session_id) REFERENCES damnation_sessions(id) ON DELETE CASCADE,
            CONSTRAINT FK_damnation_commander_damage_source FOREIGN KEY (source_player_id) REFERENCES damnation_players(id),
            CONSTRAINT FK_damnation_commander_damage_target FOREIGN KEY (target_player_id) REFERENCES damnation_players(id)
        );
    END

    -- =============================
    -- Damnation Events
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='damnation_events' AND xtype='U')
    BEGIN
        CREATE TABLE damnation_events (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            session_id UNIQUEIDENTIFIER NOT NULL,
            op_id UNIQUEIDENTIFIER NOT NULL, -- client-generated; makes retried writes idempotent
            session_version INT NOT NULL, -- the session version this event produced; orders events
            event_type VARCHAR(24) NOT NULL,
            actor_player_id UNIQUEIDENTIFIER NULL, -- NULL = the host
            target_player_id UNIQUEIDENTIFIER NULL,
            payload NVARCHAR(1000) NULL, -- small JSON: the deltas actually applied, so undo is exact
            undoes_event_id UNIQUEIDENTIFIER NULL,
            ts_created DATETIME DEFAULT GETDATE(),

            CONSTRAINT UK_damnation_events_op UNIQUE (op_id),
            CONSTRAINT CK_damnation_events_type CHECK (event_type IN
                ('join','claim','life','commander_damage','status','undo','kick','free_seat','start','reopen','rotate_code','end','reorder','setup','edit_player','reset')),
            CONSTRAINT FK_damnation_events_session FOREIGN KEY (session_id) REFERENCES damnation_sessions(id) ON DELETE CASCADE,
            CONSTRAINT FK_damnation_events_actor FOREIGN KEY (actor_player_id) REFERENCES damnation_players(id),
            CONSTRAINT FK_damnation_events_target FOREIGN KEY (target_player_id) REFERENCES damnation_players(id),
            CONSTRAINT FK_damnation_events_undoes FOREIGN KEY (undoes_event_id) REFERENCES damnation_events(id)
        );

        CREATE INDEX IX_damnation_events_session ON damnation_events (session_id, session_version);
        -- An event can be undone at most once
        CREATE UNIQUE INDEX UX_damnation_events_undoes ON damnation_events (undoes_event_id) WHERE undoes_event_id IS NOT NULL;
    END

    -- =============================
    -- Lookup indexes
    -- =============================
    -- Snapshot reads filter by session_id. Without a plain index they scan the clustered key and
    -- take shared locks on other games' rows, widening the window for lock conflicts with writes.
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_damnation_players_session')
    BEGIN
        CREATE INDEX IX_damnation_players_session ON damnation_players (session_id) INCLUDE (seat, kicked);
    END

    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_damnation_commander_damage_session')
    BEGIN
        CREATE INDEX IX_damnation_commander_damage_session ON damnation_commander_damage (session_id);
    END

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
            display_code VARCHAR(8) NOT NULL, -- opens the public player display
            current_session_id UNIQUEIDENTIFIER NULL, -- oracle_sessions.id, no FK (see cascade layout)
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

    -- =============================
    -- Oracle Sessions — one night at the table
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='oracle_sessions' AND xtype='U')
    BEGIN
        CREATE TABLE oracle_sessions (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            campaign_id UNIQUEIDENTIFIER NOT NULL,
            title NVARCHAR(160) NOT NULL,
            session_date DATE NULL,
            notes NVARCHAR(MAX) NOT NULL DEFAULT '', -- the DM's rough plan for the night, in any shape
            recap NVARCHAR(4000) NOT NULL DEFAULT '', -- what happened, written after or during the night
            is_done BIT NOT NULL DEFAULT 0,
            ts_created DATETIME DEFAULT GETDATE(),
            ts_updated DATETIME DEFAULT GETDATE(),

            CONSTRAINT FK_oracle_sessions_campaign FOREIGN KEY (campaign_id) REFERENCES oracle_campaigns(id) ON DELETE CASCADE
        );

        CREATE INDEX IX_oracle_sessions_campaign ON oracle_sessions (campaign_id, ts_created);
    END

    -- =============================
    -- Oracle Party — the player characters (count and levels feed the encounter builder)
    -- =============================
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

    -- =============================
    -- Oracle Events (session log and per-entity history)
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='oracle_events' AND xtype='U')
    BEGIN
        CREATE TABLE oracle_events (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            campaign_id UNIQUEIDENTIFIER NOT NULL,
            entity_id UNIQUEIDENTIFIER NULL, -- oracle_entities.id, no FK; NULL = a general log note
            session_title NVARCHAR(160) NULL, -- the session that was live, copied so it survives session edits
            body NVARCHAR(1000) NOT NULL,
            ts_created DATETIME DEFAULT GETDATE(),

            CONSTRAINT FK_oracle_events_campaign FOREIGN KEY (campaign_id) REFERENCES oracle_campaigns(id) ON DELETE CASCADE
        );

        CREATE INDEX IX_oracle_events_campaign ON oracle_events (campaign_id, ts_created);
        CREATE INDEX IX_oracle_events_entity ON oracle_events (entity_id, ts_created) WHERE entity_id IS NOT NULL;
    END

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

    -- =============================
    -- Oracle Settings (per DM)
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='oracle_settings' AND xtype='U')
    BEGIN
        CREATE TABLE oracle_settings (
            user_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
            chip_seconds INT NOT NULL DEFAULT 15, -- the banner brings on one new suggestion every this many seconds
            banner_images BIT NOT NULL DEFAULT 1, -- 1 = the banner mixes in reference pictures
            models NVARCHAR(400) NOT NULL DEFAULT '{}', -- JSON: generation task -> Claude model (haiku/sonnet/opus); missing entries mean haiku
            ts_created DATETIME DEFAULT GETDATE(),
            ts_updated DATETIME DEFAULT GETDATE(),

            CONSTRAINT CK_oracle_settings_chip_seconds CHECK (chip_seconds BETWEEN 5 AND 120),
            CONSTRAINT FK_oracle_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    END

    -- Module registrations
    INSERT INTO modules (id, name, slug, description, icon) VALUES
    ('A0000000-0000-0000-0000-000000000001', 'GOLEM', 'golem', 'Workout Tracker', 'Dumbbell'),
    ('A0000000-0000-0000-0000-000000000002', 'RUNE', 'rune', 'Flash Cards', 'BookOpen'),
    ('A0000000-0000-0000-0000-000000000004', 'Forage', 'forage', 'Food & macro tracker', 'Apple'),
    ('A0000000-0000-0000-0000-000000000006', 'Damnation', 'damnation', 'MTG life tracker for the whole table', 'Skull'),
    ('A0000000-0000-0000-0000-000000000007', 'Oracle', 'oracle', 'DM toolkit for running tabletop sessions', 'Dices');

    COMMIT TRANSACTION MainDbInitialization;
    PRINT '';
    PRINT 'SUCCESS: Main platform database initialized successfully.'

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION MainDbInitialization;
    END

    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();
    DECLARE @ErrorLine INT = ERROR_LINE();

    PRINT '';
    PRINT 'ERROR: Initialization failed and was rolled back!';
    PRINT 'Error Line: ' + CAST(@ErrorLine AS VARCHAR);
    PRINT 'Error Message: ' + @ErrorMessage;

    RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH
