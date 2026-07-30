-- Adds a draft status to rune cards. Draft cards are hidden from study sessions
-- and are excluded from a deck's due count, while still living in the deck so they
-- can be finished later. Parallels the existing is_disabled flag.
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.cards') AND name = 'is_draft'
)
BEGIN
    ALTER TABLE dbo.cards ADD is_draft BIT DEFAULT 0;
END
GO

-- Backfill any pre-existing rows to the non-draft default.
UPDATE dbo.cards SET is_draft = 0 WHERE is_draft IS NULL;
GO
