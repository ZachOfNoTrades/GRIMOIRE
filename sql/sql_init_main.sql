-- =============================
-- GRIMOIRE Main Database Initialization Script
-- Version: 202603251500 (Initial Release v1.0.0)
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

    -- Module registrations
    INSERT INTO modules (id, name, slug, description, icon) VALUES
    ('A0000000-0000-0000-0000-000000000001', 'GOLEM', 'golem', 'Workout Tracker', 'Dumbbell'),
    ('A0000000-0000-0000-0000-000000000002', 'RUNE', 'rune', 'Flash Cards', 'BookOpen'),
    ('A0000000-0000-0000-0000-000000000004', 'Forage', 'forage', 'Food & macro tracker', 'Apple');

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
