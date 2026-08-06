-- 2026-08-05  GRIMOIRE-QUEST
-- Add repeat_mode to quest_tasks: how a monthly / yearly cadence anchors itself to the calendar.
--   'day_of_month' (default, and what NULL means for every pre-existing row) — the start date's
--                  day number, e.g. "the 3rd of every month" / "August 3 every year".
--   'nth_weekday'  — the start date's weekday ordinal, e.g. "the first Monday of every month" /
--                  "the first Monday of August every year".
-- Ignored for daily and weekly, which already anchor by weekday (days_of_week / the start weekday).
IF COL_LENGTH('dbo.quest_tasks', 'repeat_mode') IS NULL
BEGIN
  ALTER TABLE dbo.quest_tasks ADD repeat_mode NVARCHAR(20) NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'chk_quest_tasks_repeat_mode')
BEGIN
  ALTER TABLE dbo.quest_tasks
    ADD CONSTRAINT chk_quest_tasks_repeat_mode
    CHECK (repeat_mode IS NULL OR repeat_mode IN ('day_of_month', 'nth_weekday'));
END;
GO
