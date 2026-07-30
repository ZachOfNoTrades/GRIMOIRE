-- Quest calendar + retroactive daily completion.
--
-- 1. quest_task_completions — a per-date completion log for tasks. last_completed_date on
--    quest_tasks only records the MOST RECENT completion, which can't answer "was last Tuesday's
--    occurrence done?" — the question every calendar-grid cell asks. This additive log is
--    authoritative for calendar display and makes retroactive completion idempotent (one row per
--    task per date). last_completed_date stays the streak/neglect driver.
--      awarded   — coins (base + streak bonus) granted for this completion, for history display.
--      late      — 1 when the completion landed after its occurrence's grace window had already
--                  closed, so the reduced (retro) coin multiplier was applied.
--      ledger_id — the base ledger row this completion created, for same-day uncomplete cleanup.
--
-- 2. quest_settings retro_* columns — configurable late-completion behavior:
--      retro_completion_enabled    — master toggle for marking overdue dailies complete.
--      retro_completion_multiplier — fraction (0..1) of coins paid for a late completion (0.5 = half).
--      retro_lookback_days         — how many days back a daily may be retro-completed.

-- QUEST_TASK_COMPLETIONS TABLE
IF OBJECT_ID('dbo.quest_task_completions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quest_task_completions (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_quest_task_completions_id DEFAULT NEWID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL,
    task_id UNIQUEIDENTIFIER NOT NULL,
    completed_on DATE NOT NULL,            -- the calendar date this completion counts for
    awarded DECIMAL(10,2) NOT NULL CONSTRAINT DF_quest_task_completions_awarded DEFAULT 0,
    late BIT NOT NULL CONSTRAINT DF_quest_task_completions_late DEFAULT 0,
    ledger_id UNIQUEIDENTIFIER NULL,
    ts_created DATETIME NOT NULL CONSTRAINT DF_quest_task_completions_ts DEFAULT GETDATE(),
    CONSTRAINT fk_quest_task_completions_task
      FOREIGN KEY (task_id) REFERENCES dbo.quest_tasks(id) ON DELETE CASCADE,
    CONSTRAINT uq_quest_task_completions_task_date UNIQUE (task_id, completed_on)
  );
  CREATE INDEX ix_quest_task_completions_user_date ON dbo.quest_task_completions(user_id, completed_on);
END;
GO

-- RETRO COMPLETION SETTINGS COLUMNS
IF COL_LENGTH('dbo.quest_settings', 'retro_completion_enabled') IS NULL
BEGIN
  ALTER TABLE dbo.quest_settings
    ADD retro_completion_enabled BIT NOT NULL
          CONSTRAINT DF_quest_settings_retro_enabled DEFAULT 1,
        retro_completion_multiplier DECIMAL(5,4) NOT NULL
          CONSTRAINT DF_quest_settings_retro_multiplier DEFAULT 0.5000,
        retro_lookback_days INT NOT NULL
          CONSTRAINT DF_quest_settings_retro_lookback DEFAULT 14;
END;
GO

-- BACKFILL — seed one completion row per existing daily at its current last_completed_date so the
-- calendar shows recent history immediately. awarded is left 0 (the historical award isn't known).
INSERT INTO dbo.quest_task_completions (user_id, task_id, completed_on, awarded, late)
SELECT t.user_id, t.id, t.last_completed_date, 0, 0
FROM dbo.quest_tasks t
WHERE t.kind = 'daily'
  AND t.last_completed_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM dbo.quest_task_completions c
    WHERE c.task_id = t.id AND c.completed_on = t.last_completed_date
  );
GO
