-- 2026-08-13  GRIMOIRE-RUNE
-- Add is_disabled to dbo.decks: a deck the user has paused.
-- A disabled deck stays visible and editable (unlike is_archived, which hides it from the deck
-- list entirely), but it is inert for scheduling — its cards never count toward any due total
-- (deck list, Rune home, dashboard badge, collection rollups) and never appear in the daily
-- review email. Collection study sessions skip its cards; opening the deck directly still works.
IF COL_LENGTH('dbo.decks', 'is_disabled') IS NULL
BEGIN
  ALTER TABLE dbo.decks ADD is_disabled BIT NOT NULL CONSTRAINT DF_decks_is_disabled DEFAULT 0;
END;
GO
