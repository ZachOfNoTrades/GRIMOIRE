-- Deck sharing. A deck owner shares with an email address at one of two roles:
--   view — read the deck and study it (on the sharee's own schedule)
--   edit — also change its cards and details
-- Shares are keyed on the email, not a user id, so a share to someone who hasn't signed up
-- yet simply starts working once they do — and the sharer never learns either way.

-- Study progress becomes per user. It was one card_progress row per card (card_id UNIQUE)
-- because only the owner ever studied a card; a sharee studying the same deck needs their
-- own ease/interval/next-review row beside the owner's.
DECLARE @uq sysname = (
    SELECT kc.name
    FROM sys.key_constraints kc
    JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE kc.parent_object_id = OBJECT_ID('dbo.card_progress') AND kc.type = 'UQ' AND c.name = 'card_id'
      AND (SELECT COUNT(*) FROM sys.index_columns x WHERE x.object_id = ic.object_id AND x.index_id = ic.index_id) = 1
);
IF @uq IS NOT NULL
    EXEC('ALTER TABLE dbo.card_progress DROP CONSTRAINT [' + @uq + ']');
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.card_progress') AND name = 'UX_card_progress_card_user')
    CREATE UNIQUE INDEX UX_card_progress_card_user ON dbo.card_progress (card_id, user_id);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'deck_shares' AND xtype = 'U')
BEGIN
    CREATE TABLE dbo.deck_shares (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        deck_id UNIQUEIDENTIFIER NOT NULL,
        -- Stored lowercased; the column collation is case-insensitive as well.
        email NVARCHAR(320) NOT NULL,
        role VARCHAR(10) NOT NULL CONSTRAINT CK_deck_shares_role CHECK (role IN ('view', 'edit')),
        -- The sharee's own favorite / pause state for this deck. The deck row's flags belong to
        -- the owner, so a sharee starring or pausing the deck must not change the owner's view.
        is_favorite BIT NOT NULL DEFAULT 0,
        is_disabled BIT NOT NULL DEFAULT 0,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        modified_at DATETIME2 NOT NULL DEFAULT GETDATE(),

        CONSTRAINT FK_deck_shares_deck FOREIGN KEY (deck_id) REFERENCES dbo.decks(id) ON DELETE CASCADE,
        CONSTRAINT UX_deck_shares_deck_email UNIQUE (deck_id, email)
    );
    CREATE INDEX IX_deck_shares_email ON dbo.deck_shares (email);
END
GO
