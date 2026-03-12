-- =============================
-- Workout Tracker (GOLEM) Database Initialization Script
-- Version: 202603070227 (Intitial release v0.2.0)
-- =============================

BEGIN TRANSACTION GolemDbInitialization
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
            category NVARCHAR(50) NOT NULL DEFAULT 'Strength',
            is_timed BIT NOT NULL DEFAULT 0,
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
    -- Exercise Modifiers
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='exercise_modifiers' AND xtype='U')
    BEGIN
        CREATE TABLE exercise_modifiers (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            name NVARCHAR(100) UNIQUE NOT NULL,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE()
        );
    END

    -- =============================
    -- Program Templates
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='program_templates' AND xtype='U')
    BEGIN
        CREATE TABLE program_templates (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            name NVARCHAR(255) NOT NULL,
            description NVARCHAR(MAX),
            program_prompt NVARCHAR(MAX),
            week_prompt NVARCHAR(MAX),
            session_prompt NVARCHAR(MAX),
            analysis_prompt NVARCHAR(MAX),
            days_per_week INT NOT NULL DEFAULT 4,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE()
        );
    END

    -- =============================
    -- User Profile (singleton)
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_profile' AND xtype='U')
    BEGIN
        CREATE TABLE user_profile (
            id INT NOT NULL DEFAULT 1 CHECK (id = 1),
            profile_prompt NVARCHAR(MAX) NULL,
            created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
            modified_at DATETIME2 NOT NULL DEFAULT GETDATE(),
            CONSTRAINT PK_user_profile PRIMARY KEY (id)
        );

        INSERT INTO user_profile (id) VALUES (1);
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
            template_id UNIQUEIDENTIFIER NULL,
            is_current BIT CHECK (is_current IN (0,1)) DEFAULT 0, -- 1 = currently active
            is_completed BIT CHECK (is_completed IN (0,1)) DEFAULT 0, -- 1 = finished
            is_archived BIT DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_programs_template FOREIGN KEY (template_id) REFERENCES program_templates(id)
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
            description NVARCHAR(MAX),
            review NVARCHAR(MAX),
            analysis NVARCHAR(MAX),
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

    -- =============================
    -- Target Session Segments
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='target_session_segments' AND xtype='U')
    BEGIN
        CREATE TABLE target_session_segments (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            session_id UNIQUEIDENTIFIER NOT NULL,
            exercise_id UNIQUEIDENTIFIER NOT NULL,
            modifier_id UNIQUEIDENTIFIER NULL,
            order_index INT NOT NULL,
            is_warmup BIT NOT NULL DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_target_session_segments_session FOREIGN KEY (session_id) REFERENCES workout_sessions(id),
            CONSTRAINT FK_target_session_segments_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id),
            CONSTRAINT FK_target_session_segments_modifier FOREIGN KEY (modifier_id) REFERENCES exercise_modifiers(id)
        );
    END

    -- =============================
    -- Target Session Segment Sets
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='target_session_segment_sets' AND xtype='U')
    BEGIN
        CREATE TABLE target_session_segment_sets (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            target_session_segment_id UNIQUEIDENTIFIER NOT NULL,
            set_number INT NOT NULL,
            is_warmup BIT NOT NULL DEFAULT 0,
            reps INT NULL,
            weight DECIMAL(6,1) NOT NULL,
            rpe DECIMAL(3,1),
            time_seconds INT NULL,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_target_session_segment_sets_segment FOREIGN KEY (target_session_segment_id) REFERENCES target_session_segments(id)
        );
    END

    -- =============================
    -- Session Segments
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='session_segments' AND xtype='U')
    BEGIN
        CREATE TABLE session_segments (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            session_id UNIQUEIDENTIFIER NOT NULL,
            exercise_id UNIQUEIDENTIFIER NOT NULL,
            target_id UNIQUEIDENTIFIER NULL,
            modifier_id UNIQUEIDENTIFIER NULL,
            order_index INT NOT NULL,
            is_warmup BIT NOT NULL DEFAULT 0,
            notes NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_session_segments_session FOREIGN KEY (session_id) REFERENCES workout_sessions(id),
            CONSTRAINT FK_session_segments_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id),
            CONSTRAINT FK_session_segments_target FOREIGN KEY (target_id) REFERENCES target_session_segments(id),
            CONSTRAINT FK_session_segments_modifier FOREIGN KEY (modifier_id) REFERENCES exercise_modifiers(id)
        );
    END

    -- =============================
    -- Session Segment Sets
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='session_segment_sets' AND xtype='U')
    BEGIN
        CREATE TABLE session_segment_sets (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            session_segment_id UNIQUEIDENTIFIER NOT NULL,
            set_number INT NOT NULL,
            is_warmup BIT NOT NULL DEFAULT 0,
            reps INT NULL,
            weight DECIMAL(6,1) NOT NULL,
            rpe DECIMAL(3,1),
            time_seconds INT NULL,
            notes NVARCHAR(MAX),
            is_completed BIT NOT NULL DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_session_segment_sets_segment FOREIGN KEY (session_segment_id) REFERENCES session_segments(id)
        );
    END

    COMMIT TRANSACTION GolemDbInitialization;
    PRINT '';
    PRINT 'Database initialized successfully.'

END TRY
BEGIN CATCH
    -- Rollback the transaction
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION GolemDbInitialization;
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