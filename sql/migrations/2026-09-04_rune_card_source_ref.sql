-- 2026-09-04  GRIMOIRE-RUNE
-- Add source_ref to dbo.cards: the user's own citation for where the card's material came
-- from — a URL to paste, or free text like "Per Chief's lecture". Rendered under the notes
-- on the study card's answer face, and in the deck view's card detail.
--
-- Deliberately NOT the existing `source` column. That one is an internal provenance enum
-- ('manual' / 'notion' / 'refine') describing which pipeline produced the card's content,
-- is never user-edited, and is what the deck view's grey badge shows. `source_ref` is
-- free-form, user-authored, and optional. (`source_id`, likewise, is the external
-- generator's row key, not a citation.)
--
-- Stored as markdown-ish free text and rendered through CardContent, so a bare URL
-- autolinks via remark-gfm and `[label](url)` works too. 500 chars is generous for a long
-- URL plus a label while still keeping it a one-liner rather than a second notes field.
IF COL_LENGTH('dbo.cards', 'source_ref') IS NULL
BEGIN
  ALTER TABLE dbo.cards ADD source_ref NVARCHAR(500) NULL;
END;
GO
