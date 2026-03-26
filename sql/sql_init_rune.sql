-- =============================
-- Flash Cards (RUNE) Database Initialization Script
-- Version: 202603180000
-- =============================

BEGIN TRANSACTION RuneDbInitialization
BEGIN TRY

    -- =============================
    -- Decks
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='decks' AND xtype='U')
    BEGIN
        CREATE TABLE decks (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            name NVARCHAR(255) NOT NULL,
            description NVARCHAR(MAX),
            is_archived BIT DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT UQ_decks_user_name UNIQUE (user_id, name)
        );
    END

    -- =============================
    -- Cards
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='cards' AND xtype='U')
    BEGIN
        CREATE TABLE cards (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            deck_id UNIQUEIDENTIFIER NOT NULL,
            front NVARCHAR(MAX) NOT NULL,
            back NVARCHAR(MAX) NOT NULL,
            notes NVARCHAR(MAX),
            source NVARCHAR(50) NULL,
            source_id NVARCHAR(500) NULL,
            order_index INT NOT NULL,
            is_disabled BIT DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_cards_deck FOREIGN KEY (deck_id) REFERENCES decks(id)
        );
    END

    -- =============================
    -- Study Sessions
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='study_sessions' AND xtype='U')
    BEGIN
        CREATE TABLE study_sessions (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            deck_id UNIQUEIDENTIFIER NOT NULL,
            started_at DATETIME2 DEFAULT GETDATE(),
            completed_at DATETIME2 NULL,
            duration INT NULL,
            cards_studied INT DEFAULT 0,
            cards_correct INT DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_study_sessions_deck FOREIGN KEY (deck_id) REFERENCES decks(id)
        );
    END

    -- =============================
    -- Card Reviews
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='card_reviews' AND xtype='U')
    BEGIN
        CREATE TABLE card_reviews (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            card_id UNIQUEIDENTIFIER NOT NULL,
            study_session_id UNIQUEIDENTIFIER NOT NULL,
            rating INT NOT NULL,
            response_time_ms INT NULL,
            created_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_card_reviews_card FOREIGN KEY (card_id) REFERENCES cards(id),
            CONSTRAINT FK_card_reviews_study_session FOREIGN KEY (study_session_id) REFERENCES study_sessions(id)
        );
    END

    -- =============================
    -- Card Progress (Spaced Repetition State)
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='card_progress' AND xtype='U')
    BEGIN
        CREATE TABLE card_progress (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            card_id UNIQUEIDENTIFIER UNIQUE NOT NULL,
            ease_factor DECIMAL(4,2) DEFAULT 2.50,
            interval_days INT DEFAULT 0,
            repetitions INT DEFAULT 0,
            next_review_at DATETIME2 NULL,
            last_reviewed_at DATETIME2 NULL,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_card_progress_card FOREIGN KEY (card_id) REFERENCES cards(id)
        );
    END

    COMMIT TRANSACTION RuneDbInitialization;
    PRINT '';
    PRINT 'Database initialized successfully.'

END TRY
BEGIN CATCH
    -- Rollback the transaction
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION RuneDbInitialization;
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