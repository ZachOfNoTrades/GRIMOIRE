-- 2026-09-03  GRIMOIRE-RUNE
-- Add created_via / modified_via to dbo.cards: which client channel wrote the card.
--
-- Distinct from the existing `source` column, which records where the card's CONTENT came
-- from (manual / notion / description / refine). This pair records HOW the write arrived:
--   'web' — a browser session on the grimoire UI (NextAuth cookie)
--   'api' — a direct HTTP call carrying an X-API-Key / Bearer grm_ key
--   'mcp' — an MCP tool call (rune_create_card / rune_update_card / rune_upsert_cards)
-- so the deck view can render "Created … via MCP".
--
-- Nullable with no default on purpose: rows predating this migration have no recoverable
-- channel, and the UI renders the bare date for them rather than guessing 'web'.
IF COL_LENGTH('dbo.cards', 'created_via') IS NULL
BEGIN
  ALTER TABLE dbo.cards ADD created_via NVARCHAR(20) NULL;
END;
GO

IF COL_LENGTH('dbo.cards', 'modified_via') IS NULL
BEGIN
  ALTER TABLE dbo.cards ADD modified_via NVARCHAR(20) NULL;
END;
GO
