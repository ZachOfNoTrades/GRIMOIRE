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
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE()
        );
    END

    -- =============================
    -- Workout Sessions
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='workout_sessions' AND xtype='U')
    BEGIN
        CREATE TABLE workout_sessions (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            name NVARCHAR(255) NOT NULL,
            session_date DATE NOT NULL,
            notes NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE()
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
            order_index INT NOT NULL,
            notes NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),
            
            CONSTRAINT FK_session_exercises_session FOREIGN KEY (session_id) REFERENCES workout_sessions(id),
            CONSTRAINT FK_session_exercises_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id)
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
            reps INT NOT NULL,
            weight DECIMAL(6,1) NOT NULL,
            rpe DECIMAL(3,1),
            notes NVARCHAR(MAX),
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