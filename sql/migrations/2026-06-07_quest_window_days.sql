-- Completion grace window for quest tasks (any frequency).
-- Each scheduled occurrence stays completable for `window_days` days starting on the occurrence
-- date; a single completion anywhere in that span satisfies the occurrence (counts once for
-- streak/neglect). 1 = must complete on the scheduled day (legacy behavior). E.g. a weekend
-- chore = weekly anchored on Saturday with window_days = 2.
--
-- Idempotent. Also supersedes the earlier short-lived 'window' frequency + window_start_dow/
-- window_end_dow columns: this migrates any leftover 'window' rows to weekly, drops those
-- columns, and reverts the frequency CHECK to the original four values.
USE [GRIMOIRE-QUEST-20260520];
GO

-- NEW COLUMN: grace window length in days
IF COL_LENGTH('dbo.quest_tasks', 'window_days') IS NULL
    ALTER TABLE dbo.quest_tasks ADD window_days INT NOT NULL CONSTRAINT df_quest_tasks_window_days DEFAULT 1 WITH VALUES;
GO

-- SUPERSEDE the old 'window' frequency: carry the old weekday span into window_days where present,
-- then re-home those rows on 'weekly' so the surviving CHECK accepts them.
IF COL_LENGTH('dbo.quest_tasks', 'window_start_dow') IS NOT NULL
   AND COL_LENGTH('dbo.quest_tasks', 'window_end_dow') IS NOT NULL
BEGIN
    UPDATE dbo.quest_tasks
    SET window_days = (((window_end_dow - window_start_dow + 7) % 7) + 1)
    WHERE frequency = 'window' AND window_start_dow IS NOT NULL AND window_end_dow IS NOT NULL;

    UPDATE dbo.quest_tasks SET frequency = 'weekly' WHERE frequency = 'window';
END
GO

-- FREQUENCY CHECK: drop + re-add WITHOUT 'window'
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'chk_quest_tasks_frequency'
             AND parent_object_id = OBJECT_ID('dbo.quest_tasks'))
    ALTER TABLE dbo.quest_tasks DROP CONSTRAINT chk_quest_tasks_frequency;
GO
ALTER TABLE dbo.quest_tasks ADD CONSTRAINT chk_quest_tasks_frequency
    CHECK (frequency IN ('daily','weekly','monthly','yearly'));
GO

-- DROP the obsolete weekday-span columns
IF COL_LENGTH('dbo.quest_tasks', 'window_start_dow') IS NOT NULL
    ALTER TABLE dbo.quest_tasks DROP COLUMN window_start_dow;
GO
IF COL_LENGTH('dbo.quest_tasks', 'window_end_dow') IS NOT NULL
    ALTER TABLE dbo.quest_tasks DROP COLUMN window_end_dow;
GO
