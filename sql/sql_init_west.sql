-- =============================
-- Workout Tracker (WEST) Database Initialization Script
-- Version: 202602251933 (Initial Release v0.1.0)
-- =============================

BEGIN TRANSACTION WestDbInitialization
BEGIN TRY

    -- =============================
    -- Exercises
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='exercises' AND xtype='U')
    BEGIN
        CREATE TABLE exercises (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            name NVARCHAR(255) UNIQUE NOT NULL,
            description NVARCHAR(MAX),
            is_disabled BIT DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE()
        );
    END

    -- =============================
    -- Muscle Groups
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='muscle_groups' AND xtype='U')
    BEGIN
        CREATE TABLE muscle_groups (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            name NVARCHAR(100) UNIQUE NOT NULL,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE()
        );
    END

    -- =============================
    -- Exercise Muscle Groups
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='exercise_muscle_groups' AND xtype='U')
    BEGIN
        CREATE TABLE exercise_muscle_groups (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            exercise_id UNIQUEIDENTIFIER NOT NULL,
            muscle_group_id UNIQUEIDENTIFIER NOT NULL,
            is_primary BIT NOT NULL DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_exercise_muscle_groups_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id),
            CONSTRAINT FK_exercise_muscle_groups_muscle_group FOREIGN KEY (muscle_group_id) REFERENCES muscle_groups(id),
            CONSTRAINT UQ_exercise_muscle_group UNIQUE (exercise_id, muscle_group_id)
        );
    END

    -- =============================
    -- Programs
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='programs' AND xtype='U')
    BEGIN
        CREATE TABLE programs (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            name NVARCHAR(255) NOT NULL,
            description NVARCHAR(MAX),
            is_current BIT CHECK (is_current IN (0,1)) DEFAULT 0, -- 1 = currently active
            is_completed BIT CHECK (is_completed IN (0,1)) DEFAULT 0, -- 1 = finished
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE()
        );
    END

    -- =============================
    -- Blocks
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='blocks' AND xtype='U')
    BEGIN
        CREATE TABLE blocks (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            program_id UNIQUEIDENTIFIER NOT NULL,
            name NVARCHAR(255) NOT NULL,
            order_index INT NOT NULL,
            description NVARCHAR(MAX),
            tag NVARCHAR(100), -- short label, e.g. "Hypertrophy", "Deload", "Peaking"
            color NVARCHAR(7), -- hex color code, e.g. "#3B82F6"
            is_current BIT CHECK (is_current IN (0,1)) DEFAULT 0, -- 1 = currently active
            is_completed BIT CHECK (is_completed IN (0,1)) DEFAULT 0, -- 1 = finished
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_blocks_program FOREIGN KEY (program_id) REFERENCES programs(id)
        );
    END

    -- =============================
    -- Weeks
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='weeks' AND xtype='U')
    BEGIN
        CREATE TABLE weeks (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            block_id UNIQUEIDENTIFIER NOT NULL,
            week_number INT NOT NULL,
            name NVARCHAR(255),
            description NVARCHAR(MAX),
            is_current BIT CHECK (is_current IN (0,1)) DEFAULT 0, -- 1 = currently active
            is_completed BIT CHECK (is_completed IN (0,1)) DEFAULT 0, -- 1 = finished
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_weeks_block FOREIGN KEY (block_id) REFERENCES blocks(id)
        );
    END

    -- =============================
    -- Workout Sessions
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='workout_sessions' AND xtype='U')
    BEGIN
        CREATE TABLE workout_sessions (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            week_id UNIQUEIDENTIFIER NULL,
            order_index INT NULL,
            name NVARCHAR(255) NOT NULL,
            notes NVARCHAR(MAX),
            started_at DATETIME2 NULL, -- timestamp when session was physically started
            resumed_at DATETIME2 NULL, -- timestamp when a completed session was most recently resumed
            duration INT NULL, -- accumulated duration in seconds
            is_current BIT CHECK (is_current IN (0,1)) DEFAULT 0, -- 1 = currently active
            is_completed BIT CHECK (is_completed IN (0,1)) DEFAULT 0, -- 1 = finished
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_workout_sessions_week FOREIGN KEY (week_id) REFERENCES weeks(id)
        );
    END

-- TODO rebrand "session exercises" to better differentiate from exercises

    -- =============================
    -- Target Session Exercises
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='target_session_exercises' AND xtype='U')
    BEGIN
        CREATE TABLE target_session_exercises (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            session_id UNIQUEIDENTIFIER NOT NULL,
            exercise_id UNIQUEIDENTIFIER NOT NULL,
            order_index INT NOT NULL,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_target_exercises_session FOREIGN KEY (session_id) REFERENCES workout_sessions(id),
            CONSTRAINT FK_target_exercises_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id)
        );
    END

    -- =============================
    -- Target Session Exercise Sets
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='target_session_exercise_sets' AND xtype='U')
    BEGIN
        CREATE TABLE target_session_exercise_sets (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            target_session_exercise_id UNIQUEIDENTIFIER NOT NULL,
            set_number INT NOT NULL,
            is_warmup BIT NOT NULL DEFAULT 0,
            reps INT NOT NULL,
            weight DECIMAL(6,1) NOT NULL,
            rpe DECIMAL(3,1),
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_target_sets_target_exercise FOREIGN KEY (target_session_exercise_id) REFERENCES target_session_exercises(id)
        );
    END

    -- =============================
    -- Session Exercises
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='session_exercises' AND xtype='U')
    BEGIN
        CREATE TABLE session_exercises (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            session_id UNIQUEIDENTIFIER NOT NULL,
            exercise_id UNIQUEIDENTIFIER NOT NULL,
            target_id UNIQUEIDENTIFIER NULL,
            order_index INT NOT NULL,
            notes NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_session_exercises_session FOREIGN KEY (session_id) REFERENCES workout_sessions(id),
            CONSTRAINT FK_session_exercises_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id),
            CONSTRAINT FK_session_exercises_target FOREIGN KEY (target_id) REFERENCES target_session_exercises(id)
        );
    END

    -- =============================
    -- Session Exercise Sets
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='session_exercise_sets' AND xtype='U')
    BEGIN
        CREATE TABLE session_exercise_sets (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            session_exercise_id UNIQUEIDENTIFIER NOT NULL,
            set_number INT NOT NULL,
            is_warmup BIT NOT NULL DEFAULT 0,
            reps INT NOT NULL,
            weight DECIMAL(6,1) NOT NULL,
            rpe DECIMAL(3,1),
            notes NVARCHAR(MAX),
            is_completed BIT NOT NULL DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_session_exercise_sets_session_exercise FOREIGN KEY (session_exercise_id) REFERENCES session_exercises(id)
        );
    END

    COMMIT TRANSACTION WestDbInitialization;
    PRINT '';
    PRINT 'Database initialized successfully.'

END TRY
BEGIN CATCH
    -- Rollback the transaction
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION WestDbInitialization;
    END

    -- Report the error
    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();
    DECLARE @ErrorLine INT = ERROR_LINE();

    PRINT '';
    PRINT 'ERROR: Initialization failed and was rolled back!';
    PRINT 'Error Line: ' + CAST(@ErrorLine AS VARCHAR);
    PRINT 'Error Message: ' + @ErrorMessage;
    
    -- Re-raise the error
    RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH