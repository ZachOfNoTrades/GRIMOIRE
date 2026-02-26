-- =============================
-- Workout Tracker (WEST) Sample Data
-- Version: 202602251933 (Initial Release v0.1.0)
-- =============================

BEGIN TRANSACTION WestDbSampleRecords;
BEGIN TRY

    INSERT INTO exercises (name, description) VALUES
    ('Back Squat', 'Primary competition squat'),
    ('Front Squat', 'Quad emphasis variation'),
    ('Leg Press', 'Machine variation'),
    ('Conventional Deadlift', 'Competition deadlift'),
    ('Romanian Deadlift', 'Hamstring emphasis'),
    ('Bench Press', 'Competition bench'),
    ('Incline Bench Press', 'Upper chest emphasis'),
    ('Overhead Press', 'Standing press'),
    ('Pull-Up', 'Vertical pull'),
    ('Barbell Row', 'Horizontal pull'),
    ('Lat Pulldown', 'Machine vertical pull'),
    ('Cable Row', 'Machine horizontal pull'),
    ('Split Squat', 'Unilateral leg work'),
    ('Lunges', 'Dynamic unilateral'),
    ('Bicep Curl', 'Arm isolation'),
    ('Tricep Extension', 'Arm isolation'),
    ('Lateral Raise', 'Side delt isolation'),
    ('Face Pull', 'Rear delt and rotator cuff'),
    ('Plank', 'Core stability'),
    ('Dead Bug', 'Core activation');

 COMMIT TRANSACTION WestDbSampleRecords;
    PRINT '';
    PRINT 'WEST records created successfully.'

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION WestDbSampleRecords;
    END

    DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
    DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
    DECLARE @ErrorState INT = ERROR_STATE();
    DECLARE @ErrorLine INT = ERROR_LINE();

    PRINT '';
    PRINT 'ERROR: Migration failed and was rolled back!';
    PRINT 'Error Line: ' + CAST(@ErrorLine AS VARCHAR);
    PRINT 'Error Message: ' + @ErrorMessage;

    RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
END CATCH
