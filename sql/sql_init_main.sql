-- =============================
-- GRIMOIRE Main Database Initialization Script
-- Version: 202609141200 (Damnation module)
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
            commander_damage_enabled BIT NOT NULL CONSTRAINT DF_damnation_settings_commander_damage DEFAULT 1, -- 0 = hide commander damage in this host's games
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
            board_layout VARCHAR(20) NULL, -- board arrangement key (lib/boardLayouts.ts); NULL = automatic grid
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
                ('join','claim','life','commander_damage','status','undo','kick','free_seat','start','reopen','rotate_code','end','reorder','setup','edit_player')),
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

    -- Module registrations
    INSERT INTO modules (id, name, slug, description, icon) VALUES
    ('A0000000-0000-0000-0000-000000000001', 'GOLEM', 'golem', 'Workout Tracker', 'Dumbbell'),
    ('A0000000-0000-0000-0000-000000000002', 'RUNE', 'rune', 'Flash Cards', 'BookOpen'),
    ('A0000000-0000-0000-0000-000000000004', 'Forage', 'forage', 'Food & macro tracker', 'Apple'),
    ('A0000000-0000-0000-0000-000000000006', 'Damnation', 'damnation', 'MTG life tracker for the whole table', 'Skull');

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
