-- 2026-07-24  GRIMOIRE-QUEST
-- Add an optional free-text description/notes field to quest tasks (todos + dailies).
-- title stays the short label; description holds longer notes shown as a sub-line on the task row.
IF COL_LENGTH('dbo.quest_tasks', 'description') IS NULL
BEGIN
  ALTER TABLE dbo.quest_tasks ADD description NVARCHAR(MAX) NULL;
END;
