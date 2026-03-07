-- =============================
-- GOLEM Database Migration Script
-- From Version: 202602251933 (Initial Release v0.1.0)
-- To Version: 202603070227 (Intitial release v0.2.0)
-- =============================

BEGIN TRANSACTION GolemMigration_202603070227;
BEGIN TRY

    PRINT 'Starting migration to 202603070227...';
    PRINT '';

    -- =============================
    -- Step 1: Rename workout_sessions.notes to description
    -- =============================
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('workout_sessions') AND name = 'notes')
    BEGIN
        PRINT 'Renaming workout_sessions.notes to description...';
        EXEC sp_rename 'workout_sessions.notes', 'description', 'COLUMN';
        PRINT 'Column renamed.';
    END
    ELSE
    BEGIN
        PRINT 'Column workout_sessions.notes does not exist (already renamed), skipping...';
    END

    -- =============================
    -- Step 2: Add workout_sessions.review column
    -- =============================
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('workout_sessions') AND name = 'review')
    BEGIN
        PRINT 'Adding workout_sessions.review column...';
        ALTER TABLE workout_sessions ADD review NVARCHAR(MAX) NULL;
        PRINT 'Column added.';
    END
    ELSE
    BEGIN
        PRINT 'Column workout_sessions.review already exists, skipping...';
    END

    COMMIT TRANSACTION GolemMigration_202603070227;
    PRINT '';
    PRINT 'SUCCESS: Migration from 202602251933 to 202603070227 completed successfully.';

END TRY
BEGIN CATCH
    -- Rollback the transaction
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION GolemMigration_202603070227;
    END

    -- Report the error
    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();
    DECLARE @ErrorLine INT = ERROR_LINE();

    PRINT '';
    PRINT 'ERROR: Migration failed and was rolled back!';
    PRINT 'Error Line: ' + CAST(@ErrorLine AS VARCHAR);
    PRINT 'Error Message: ' + @ErrorMessage;

    -- Re-raise the error
    RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH
