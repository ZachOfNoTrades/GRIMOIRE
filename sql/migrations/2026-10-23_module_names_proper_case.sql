-- 2026-10-23  GRIMOIRE-MAIN
-- Name the Golem and Rune modules in Proper case, as the other modules are named
UPDATE dbo.modules SET name = N'Golem' WHERE slug = N'golem' AND name = N'GOLEM';
UPDATE dbo.modules SET name = N'Rune' WHERE slug = N'rune' AND name = N'RUNE';
GO
