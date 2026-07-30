-- =============================
-- RUNE: collections (a named group of decks, studied as one session)
--   - collections: user-owned group ("Fire Department"), name unique per user.
--   - collection_decks: membership rows; a deck may belong to many collections.
--   - study_sessions.collection_id: a session started from a collection spans
--     several decks, so deck_id is meaningless for it. deck_id is relaxed to NULL
--     and exactly one of (deck_id, collection_id) is set by the app. No CHECK
--     constraint: deleting a collection NULLs collection_id on its historical
--     sessions (keeping the review history) which would otherwise violate it.
-- Idempotent: guarded per-object so re-running is safe.
-- =============================

-- =============================
-- Collections
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
-- Collection Decks (membership)
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
-- Study Sessions: collection-scoped sessions
-- =============================
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('study_sessions') AND name = 'deck_id' AND is_nullable = 0)
BEGIN
    ALTER TABLE study_sessions ALTER COLUMN deck_id UNIQUEIDENTIFIER NULL;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('study_sessions') AND name = 'collection_id')
BEGIN
    ALTER TABLE study_sessions ADD collection_id UNIQUEIDENTIFIER NULL;
END

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_study_sessions_collection')
BEGIN
    ALTER TABLE study_sessions
        ADD CONSTRAINT FK_study_sessions_collection FOREIGN KEY (collection_id) REFERENCES collections(id);
END
