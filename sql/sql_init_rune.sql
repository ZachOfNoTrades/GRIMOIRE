-- =============================
-- Flash Cards (RUNE) Database Initialization Script
-- Version: 202607031200
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
            source_url NVARCHAR(2000) NULL,
            is_archived BIT DEFAULT 0,
            is_favorite BIT NOT NULL DEFAULT 0,
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
            category NVARCHAR(100) NULL,
            source NVARCHAR(50) NULL,
            source_id NVARCHAR(500) NULL,
            -- The user's own citation for where the card's material came from: a URL to
            -- paste, or free text like "Per Chief's lecture". Rendered under the notes on
            -- the study card's answer face. Distinct from `source`/`source_id`, which are
            -- internal provenance (which pipeline produced the content, and its row key).
            source_ref NVARCHAR(500) NULL,
            order_index INT NOT NULL,
            is_disabled BIT DEFAULT 0,
            is_draft BIT DEFAULT 0, -- draft cards are hidden from study sessions and excluded from the deck's due count
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),
            -- Which client channel wrote the card ('web' | 'api' | 'mcp'). Distinct from `source`,
            -- which records where the card's CONTENT came from. Nullable: pre-2026-09-03 rows
            -- have no recoverable channel.
            created_via NVARCHAR(20) NULL,
            modified_via NVARCHAR(20) NULL,

            CONSTRAINT FK_cards_deck FOREIGN KEY (deck_id) REFERENCES decks(id)
        );
    END

    -- =============================
    -- Collections (a named group of decks, studied as one session)
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='collections' AND xtype='U')
    BEGIN
        CREATE TABLE collections (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            name NVARCHAR(255) NOT NULL,
            description NVARCHAR(MAX),
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT UQ_collections_user_name UNIQUE (user_id, name)
        );
    END

    -- =============================
    -- Collection Decks (membership — a deck may belong to many collections)
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='collection_decks' AND xtype='U')
    BEGIN
        CREATE TABLE collection_decks (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            collection_id UNIQUEIDENTIFIER NOT NULL,
            deck_id UNIQUEIDENTIFIER NOT NULL,
            order_index INT NOT NULL DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_collection_decks_collection FOREIGN KEY (collection_id) REFERENCES collections(id),
            CONSTRAINT FK_collection_decks_deck FOREIGN KEY (deck_id) REFERENCES decks(id),
            CONSTRAINT UQ_collection_decks UNIQUE (collection_id, deck_id)
        );
    END

    -- =============================
    -- Study Sessions
    -- A session is scoped to EITHER one deck or one collection: the app sets exactly
    -- one of deck_id / collection_id. Both are nullable because deleting a collection
    -- NULLs collection_id on its historical sessions rather than destroying the
    -- review history hanging off them.
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='study_sessions' AND xtype='U')
    BEGIN
        CREATE TABLE study_sessions (
            id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
            user_id UNIQUEIDENTIFIER NOT NULL,
            deck_id UNIQUEIDENTIFIER NULL,
            collection_id UNIQUEIDENTIFIER NULL,
            started_at DATETIME2 DEFAULT GETDATE(),
            completed_at DATETIME2 NULL,
            duration INT NULL,
            cards_studied INT DEFAULT 0,
            cards_correct INT DEFAULT 0,
            created_at DATETIME2 DEFAULT GETDATE(),
            modified_at DATETIME2 DEFAULT GETDATE(),

            CONSTRAINT FK_study_sessions_deck FOREIGN KEY (deck_id) REFERENCES decks(id),
            CONSTRAINT FK_study_sessions_collection FOREIGN KEY (collection_id) REFERENCES collections(id)
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

    -- =============================
    -- Rune Settings (per-user digest config)
    -- =============================
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='rune_settings' AND xtype='U')
    BEGIN
        CREATE TABLE rune_settings (
            user_id UNIQUEIDENTIFIER PRIMARY KEY,
            digest_enabled BIT NOT NULL DEFAULT 0,
            digest_time TIME NOT NULL DEFAULT '08:00:00',
            digest_last_sent_date DATE NULL,
            evaluation_system_prompt NVARCHAR(MAX) NULL, -- NULL = use the bundled default evaluateAnswerSystem.md template
            evaluation_personality_prompt NVARCHAR(MAX) NULL, -- NULL = use the bundled default evaluateAnswerPersonality.md template
            auto_advance_on_evaluate BIT NOT NULL DEFAULT 0, -- auto-accept suggested rating + advance after evaluating (non-hands-free)
            auto_advance_seconds INT NOT NULL DEFAULT 5, -- delay before the auto-advance fires
            evaluation_sound_enabled BIT NOT NULL DEFAULT 1, -- play a pleasant chime on evaluation, pitched to the rating
            daily_goal INT NULL, -- soft motivational target: cards to review per day (NULL = use app default)
            daily_max_renew INT NULL, -- soft ceiling: warn (don't block) once the day's reviews pass this (NULL = use app default)
            ts_created DATETIME2 NOT NULL DEFAULT GETDATE(),
            ts_modified DATETIME2 NOT NULL DEFAULT GETDATE()
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