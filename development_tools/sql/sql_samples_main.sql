-- =============================
-- GRIMOIRE Main Database Sample Data
-- Version: 202603251500 (Initial Release v1.0.0)
--
-- Replace email with desired Google account
-- =============================

BEGIN TRANSACTION MainDbSampleRecords;
BEGIN TRY

    -- =============================
    -- Users
    -- =============================
    INSERT INTO users (email, name, global_admin, generation_limit, enabled) VALUES
    ('admin@example.com', 'Admin User', 1, 0, 1);

    COMMIT TRANSACTION MainDbSampleRecords;
    PRINT '';
    PRINT 'SUCCESS: Main platform sample data inserted successfully.'

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION MainDbSampleRecords;
    END

    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();
    DECLARE @ErrorLine INT = ERROR_LINE();

    PRINT '';
    PRINT 'ERROR: Sample data insertion failed and was rolled back!';
    PRINT 'Error Line: ' + CAST(@ErrorLine AS VARCHAR);
    PRINT 'Error Message: ' + @ErrorMessage;

    RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH
