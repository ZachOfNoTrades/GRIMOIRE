-- 2026-10-09  GRIMOIRE-MAIN
-- Oracle gets its own module icon (components/ui/OracleIcon.tsx, registered in lib/iconMap.ts as
-- "OracleIcon") in place of the generic Lucide dice.
UPDATE dbo.modules SET icon = N'OracleIcon' WHERE slug = N'oracle' AND icon = N'Dices';
GO
