-- =============================
-- Forage Database Initialization Script
-- Version: 202605261543 (Initial release v1.1.0)
-- =============================

BEGIN TRANSACTION ForageDbInitialization
BEGIN TRY

    -- =============================
    -- Foods
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='foods' AND xtype='U')
    BEGIN
        CREATE TABLE foods (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NULL, -- NULL = shared, non-null = user's custom
            name NVARCHAR(255) NOT NULL,
            brand NVARCHAR(255) NULL,
            kcal_per_serving DECIMAL(8,2) NOT NULL DEFAULT 0,
            protein_g_per_serving DECIMAL(8,2) NOT NULL DEFAULT 0,
            carbs_g_per_serving DECIMAL(8,2) NOT NULL DEFAULT 0,
            fat_g_per_serving DECIMAL(8,2) NOT NULL DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE()
        );

        CREATE INDEX IX_foods_user_name ON foods (user_id, name);
    END

    -- =============================
    -- Units
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='units' AND xtype='U')
    BEGIN
        CREATE TABLE units (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            name NVARCHAR(32) UNIQUE NOT NULL
        );
    END

    -- =============================
    -- Food Servings
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='food_servings' AND xtype='U')
    BEGIN
        CREATE TABLE food_servings (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            food_id UNIQUEIDENTIFIER NOT NULL,
            unit NVARCHAR(32) NOT NULL,
            units_per_serving DECIMAL(10,4) NOT NULL,
            created_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_food_servings_food FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE,
            CONSTRAINT FK_food_servings_unit FOREIGN KEY (unit) REFERENCES units(name)
        );
    END

    -- =============================
    -- Food Entries
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='food_entries' AND xtype='U')
    BEGIN
        CREATE TABLE food_entries (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,

            -- Date and time are seperated for quicker and simpler sorting
            entry_date DATE NOT NULL,
            entry_time TIME NOT NULL DEFAULT CONVERT(TIME, GETDATE()),

            food_id UNIQUEIDENTIFIER NOT NULL,
            quantity DECIMAL(8,3) NOT NULL DEFAULT 1, -- UOM = servings
            created_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_food_entries_food FOREIGN KEY (food_id) REFERENCES foods(id)
        );

        CREATE INDEX IX_food_entries_user_date ON food_entries (user_id, entry_date);
    END

    -- =============================
    -- Nutrients
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='nutrients' AND xtype='U')
    BEGIN
        CREATE TABLE nutrients (
            id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            code        NVARCHAR(32)  UNIQUE NOT NULL, -- Code for frontend lookup
            name        NVARCHAR(64)  NOT NULL,
            unit        NVARCHAR(8)   NOT NULL,
            daily_value DECIMAL(12,4) NULL -- FDA 2016 label DV (Adults 4+); NULL = no DV defined
        );
    END

    -- =============================
    -- Food Nutrients
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='food_nutrients' AND xtype='U')
    BEGIN
        CREATE TABLE food_nutrients (
            food_id     UNIQUEIDENTIFIER NOT NULL,
            nutrient_id UNIQUEIDENTIFIER NOT NULL,
            quantity    DECIMAL(8,3)     NOT NULL, -- UOM = nutrient UOM

            CONSTRAINT PK_food_nutrients PRIMARY KEY (food_id, nutrient_id),
            CONSTRAINT FK_food_nutrients_food FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE,
            CONSTRAINT FK_food_nutrients_nutrient FOREIGN KEY (nutrient_id) REFERENCES nutrients(id)
        );
    END

    COMMIT TRANSACTION ForageDbInitialization;
    PRINT '';
    PRINT 'Database initialized successfully.'

END TRY
BEGIN CATCH
    -- Rollback the transaction
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION ForageDbInitialization;
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
