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

    -- Module registrations
    INSERT INTO modules (id, name, slug, description, icon) VALUES
    ('A0000000-0000-0000-0000-000000000001', 'GOLEM', 'golem', 'Workout Tracker', 'Dumbbell'),
    ('A0000000-0000-0000-0000-000000000002', 'RUNE', 'rune', 'Flash Cards', 'BookOpen');

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
