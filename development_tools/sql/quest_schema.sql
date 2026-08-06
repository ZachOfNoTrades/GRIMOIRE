IF OBJECT_ID('dbo.quest_tasks', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quest_tasks (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL,
    title NVARCHAR(500) NOT NULL,
    -- Optional free-text notes/details for the task. title is the short label; description holds
    -- longer context, shown as a muted sub-line under the title on the task row. NULL = none.
    description NVARCHAR(MAX) NULL,
    difficulty NVARCHAR(20) NOT NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'open',
    kind NVARCHAR(10) NOT NULL DEFAULT 'todo',
    last_completed_date DATE NULL,
    frequency NVARCHAR(20) NOT NULL DEFAULT 'daily',
    days_of_week NVARCHAR(50) NULL,
    every_n INT NOT NULL DEFAULT 1,
    start_date DATE NULL,
    -- How a monthly / yearly cadence anchors to the calendar:
    --   'day_of_month' (also what NULL means) — the start date's day number, e.g. "the 3rd of every
    --                  month" / "August 3 every year".
    --   'nth_weekday'  — the start date's weekday ordinal, e.g. "the first Monday of every month" /
    --                  "the first Monday of August every year". A month with no 5th <weekday>
    --                  simply has no occurrence that month.
    -- Ignored for daily and weekly, which already anchor by weekday (days_of_week / start weekday).
    repeat_mode NVARCHAR(20) NULL,
    -- Completion grace window (any frequency): each scheduled occurrence stays completable for
    -- window_days days starting on the occurrence date, and a single completion anywhere in that
    -- span satisfies the occurrence (counts once for streak/neglect). 1 = must complete on the
    -- scheduled day (legacy behavior). E.g. a weekend chore = weekly anchored on Saturday with
    -- window_days = 2 (completable Sat OR Sun).
    window_days INT NOT NULL DEFAULT 1,
    -- Manual reward override. When set (NOT NULL), this value REPLACES the difficulty-derived base
    -- reward for this task (streak / age / bonus multipliers still build on top of it). NULL = use
    -- the per-difficulty factor as before.
    manual_reward_override DECIMAL(10,2) NULL,
    -- One-shot schedule override. When set, this task is treated as scheduled for that single
    -- date in addition to its normal cadence — used by the "carry to today" picker on the
    -- freeze-day flow so a weekly that fell on a frozen day can slide to the next active day.
    -- Cleared on completion / uncompletion of that occurrence and on unfreeze.
    deferred_to_date DATE NULL,
    sort_order INT NOT NULL DEFAULT 0,
    streak_count INT NOT NULL DEFAULT 0,
    streak_last_date DATE NULL,
    last_bonus_date DATE NULL,
    neglect_count INT NOT NULL DEFAULT 0,
    neglect_last_date DATE NULL,
    ts_created DATETIME NOT NULL DEFAULT GETDATE(),
    ts_completed DATETIME NULL,
    CONSTRAINT chk_quest_tasks_difficulty CHECK (difficulty IN ('easy','medium','hard','max')),
    CONSTRAINT chk_quest_tasks_status CHECK (status IN ('open','done')),
    CONSTRAINT chk_quest_tasks_kind CHECK (kind IN ('todo','daily')),
    CONSTRAINT chk_quest_tasks_repeat_mode CHECK (repeat_mode IS NULL OR repeat_mode IN ('day_of_month','nth_weekday')),
    CONSTRAINT chk_quest_tasks_frequency CHECK (frequency IN ('daily','weekly','monthly','yearly'))
  );
  CREATE INDEX ix_quest_tasks_user ON dbo.quest_tasks(user_id, status);
END;

IF OBJECT_ID('dbo.quest_subtasks', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quest_subtasks (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    task_id UNIQUEIDENTIFIER NOT NULL,
    title NVARCHAR(500) NOT NULL,
    done BIT NOT NULL DEFAULT 0,
    position INT NOT NULL DEFAULT 0,
    last_bonus_date DATE NULL,
    ts_created DATETIME NOT NULL DEFAULT GETDATE(),
    ts_completed DATETIME NULL,
    CONSTRAINT fk_quest_subtasks_task FOREIGN KEY (task_id) REFERENCES dbo.quest_tasks(id) ON DELETE CASCADE
  );
  CREATE INDEX ix_quest_subtasks_task ON dbo.quest_subtasks(task_id, position);
END;

IF OBJECT_ID('dbo.quest_rewards', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quest_rewards (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL,
    name NVARCHAR(255) NOT NULL,
    cost INT NOT NULL,
    ts_created DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT chk_quest_rewards_cost CHECK (cost > 0)
  );
  CREATE INDEX ix_quest_rewards_user ON dbo.quest_rewards(user_id);
END;

IF OBJECT_ID('dbo.quest_mantras', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quest_mantras (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL,
    text NVARCHAR(500) NOT NULL,
    ts_created DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX ix_quest_mantras_user ON dbo.quest_mantras(user_id, ts_created);
END;

IF OBJECT_ID('dbo.quest_debts', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quest_debts (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL,
    name NVARCHAR(255) NOT NULL,
    amount_remaining INT NOT NULL,
    ts_created DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT chk_quest_debts_amount CHECK (amount_remaining >= 0)
  );
  CREATE INDEX ix_quest_debts_user ON dbo.quest_debts(user_id);
END;

IF OBJECT_ID('dbo.quest_ledger', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quest_ledger (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL,
    delta DECIMAL(10,2) NOT NULL,
    reason NVARCHAR(500) NOT NULL,
    ref_type NVARCHAR(20) NULL,
    ref_id UNIQUEIDENTIFIER NULL,
    ts_created DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX ix_quest_ledger_user ON dbo.quest_ledger(user_id, ts_created DESC);
END;

IF OBJECT_ID('dbo.quest_damage_log', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quest_damage_log (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL,
    damage INT NOT NULL,            -- HP lost (positive)
    health_before INT NOT NULL,
    health_after INT NOT NULL,      -- post-damage; equals max_health if the hit triggered a death
    died BIT NOT NULL DEFAULT 0,
    reason NVARCHAR(500) NOT NULL,
    -- Date this damage is "for" (e.g. yesterday's missed dailies). NULL for ad-hoc damage
    -- (habits, manual adjustments) where the calendar date isn't load-bearing. freezeDay
    -- reverses by matching target_date = frozen_date instead of relying on ts_created math,
    -- so the reversal works even when the damage check ran on a day other than (date + 1).
    target_date DATE NULL,
    ts_created DATETIME NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX ix_quest_damage_log_user ON dbo.quest_damage_log(user_id, ts_created DESC);
END;

IF OBJECT_ID('dbo.quest_settings', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quest_settings (
    user_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    factor_easy DECIMAL(6,3) NOT NULL DEFAULT 0.250,
    factor_medium DECIMAL(6,3) NOT NULL DEFAULT 0.500,
    factor_hard DECIMAL(6,3) NOT NULL DEFAULT 1.000,
    factor_max DECIMAL(6,3) NOT NULL DEFAULT 2.000,
    damage_factor DECIMAL(6,3) NOT NULL DEFAULT 1.000,
    coin_damage_easy DECIMAL(10,2) NOT NULL DEFAULT 0.25,
    coin_damage_medium DECIMAL(10,2) NOT NULL DEFAULT 0.5,
    coin_damage_hard DECIMAL(10,2) NOT NULL DEFAULT 1.0,
    coin_damage_max DECIMAL(10,2) NOT NULL DEFAULT 2.0,
    health_damage_easy DECIMAL(10,2) NOT NULL DEFAULT 5,
    health_damage_medium DECIMAL(10,2) NOT NULL DEFAULT 5,
    health_damage_hard DECIMAL(10,2) NOT NULL DEFAULT 5,
    health_damage_max DECIMAL(10,2) NOT NULL DEFAULT 5,
    simulation_date DATE NULL,
    streak_factor DECIMAL(6,3) NOT NULL DEFAULT 0.050,
    streak_cap INT NOT NULL DEFAULT 30,
    neglect_factor DECIMAL(6,3) NOT NULL DEFAULT 0.050,
    neglect_cap INT NOT NULL DEFAULT 30,
    advanced_mode BIT NOT NULL DEFAULT 0,
    -- reward_formula is the per-difficulty DAILY reward formula (kept name for legacy DB compat).
    -- todo_reward_formula is the per-difficulty TODO reward formula. streak_bonus_formula is
    -- repurposed as the unified damage formula (legacy column name).
    reward_formula NVARCHAR(500) NULL,
    todo_reward_formula NVARCHAR(500) NULL,
    streak_bonus_formula NVARCHAR(500) NULL,
    -- Random "aged todo" bonus. Deterministic per (user, today) hash; daily_chance is the per-day
    -- bonus probability as a percentage in [0, 100]. age_bias is the exponent on (age+1) when
    -- weighting eligible todos: 0 = uniform, +N favours older, -N favours newer.
    todo_bonus_enabled BIT NOT NULL DEFAULT 0,
    todo_bonus_daily_chance DECIMAL(6,3) NOT NULL DEFAULT 20.000,
    todo_bonus_multiplier DECIMAL(6,3) NOT NULL DEFAULT 3.000,
    todo_bonus_age_bias DECIMAL(6,3) NOT NULL DEFAULT 1.000,
    -- Debug-only manual override of which todo gets today's bonus; persists until cleared.
    forced_todo_bonus_id UNIQUEIDENTIFIER NULL,
    -- Daily Discord digest. digest_time is the local wall-clock time the scheduler aims for;
    -- digest_last_sent_date is the user's simulated `today` the last digest covered, used to
    -- guarantee at-most-once delivery per day even if the scheduler ticks twice in the minute.
    digest_enabled BIT NOT NULL DEFAULT 0,
    digest_time TIME(0) NOT NULL DEFAULT '08:00:00',
    digest_last_sent_date DATE NULL,
    -- Bonus-task Discord notification. Same shape as the digest fields: at-most-once per day
    -- via bonus_notif_last_sent_date, fired by the same scheduler tick once the clock has
    -- reached/passed bonus_notif_time.
    bonus_notif_enabled BIT NOT NULL DEFAULT 0,
    bonus_notif_time TIME(0) NOT NULL DEFAULT '08:00:00',
    bonus_notif_last_sent_date DATE NULL,
    -- When 1, the scheduler sends the notification every day (including the "no bonus today"
    -- embed). When 0 (default), the scheduler only sends on days where a bonus actually rolled.
    bonus_notif_always BIT NOT NULL DEFAULT 0,
    -- Retroactive daily completion. When enabled, an overdue daily can be marked complete for a
    -- past date from the calendar, paying retro_completion_multiplier (0..1) of the normal reward.
    -- retro_lookback_days bounds how far back a daily may be retro-completed.
    retro_completion_enabled BIT NOT NULL DEFAULT 1,
    retro_completion_multiplier DECIMAL(5,4) NOT NULL DEFAULT 0.5000,
    retro_lookback_days INT NOT NULL DEFAULT 14,
    -- "All dailies complete" bonus. When enabled, the moment every daily scheduled for today
    -- becomes done, a flat all_dailies_bonus_amount coin bonus is paid once for that date.
    -- all_dailies_bonus_last_awarded_date is the idempotency stamp (same shape as
    -- digest_last_sent_date / bonus_notif_last_sent_date).
    all_dailies_bonus_enabled BIT NOT NULL DEFAULT 0,
    all_dailies_bonus_amount DECIMAL(10,2) NOT NULL DEFAULT 5.00,
    all_dailies_bonus_last_awarded_date DATE NULL,
    ts_created DATETIME NOT NULL DEFAULT GETDATE(),
    ts_modified DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT chk_quest_settings_factor_easy CHECK (factor_easy >= 0),
    CONSTRAINT chk_quest_settings_factor_medium CHECK (factor_medium >= 0),
    CONSTRAINT chk_quest_settings_factor_hard CHECK (factor_hard >= 0),
    CONSTRAINT chk_quest_settings_factor_max CHECK (factor_max >= 0),
    CONSTRAINT chk_quest_settings_damage_factor CHECK (damage_factor >= 0)
  );
END;

IF OBJECT_ID('dbo.quest_habits', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quest_habits (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL,
    title NVARCHAR(500) NOT NULL,
    difficulty NVARCHAR(20) NOT NULL,
    allow_positive BIT NOT NULL DEFAULT 1,
    allow_negative BIT NOT NULL DEFAULT 1,
    ts_created DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT chk_quest_habits_difficulty CHECK (difficulty IN ('easy','medium','hard','max'))
  );
  CREATE INDEX ix_quest_habits_user ON dbo.quest_habits(user_id);
END;

IF OBJECT_ID('dbo.quest_user_state', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quest_user_state (
    user_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    health INT NOT NULL DEFAULT 50,
    max_health INT NOT NULL DEFAULT 50,
    last_damage_check_date DATE NULL,
    last_review_ack_date DATE NULL,
    -- Cache of the user's previous-day review selections so a debug clearTodayReview can pop
    -- the modal again with those same checkboxes already filled in. last_review_completion_data
    -- is JSON of shape { tasks: string[], subtasks: { taskId: string, subtaskId: string }[] }.
    -- The pair is only treated as a pre-fill when last_review_completion_date matches the
    -- modal's current review date; older dates are ignored on read.
    last_review_completion_date DATE NULL,
    last_review_completion_data NVARCHAR(MAX) NULL,
    ts_modified DATETIME NOT NULL DEFAULT GETDATE()
  );
END;

-- "Freeze days" — dates the user designates as out-of-town / sick / otherwise excused so the
-- daily damage check skips them. Freezing a date also reverses any daily-task ledger entries
-- credited on that date (you forfeit the rewards you earned in exchange for damage immunity).
-- Primary key is (user_id, frozen_date) so the freeze action is naturally idempotent.
IF OBJECT_ID('dbo.quest_frozen_days', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quest_frozen_days (
    user_id UNIQUEIDENTIFIER NOT NULL,
    frozen_date DATE NOT NULL,
    ts_created DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT pk_quest_frozen_days PRIMARY KEY (user_id, frozen_date)
  );
END;

-- Per-date completion log. quest_tasks.last_completed_date only records the MOST RECENT
-- completion; this table records EVERY dated completion so the calendar can render done/missed per
-- day and so retroactive completion is idempotent (UNIQUE task_id+completed_on). last_completed_date
-- stays the streak/neglect driver. `late` = 1 when the reduced retro multiplier was applied;
-- `awarded` is the coins (base + streak bonus) granted; `ledger_id` links the base ledger row for
-- same-day uncomplete cleanup.
IF OBJECT_ID('dbo.quest_task_completions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quest_task_completions (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL,
    task_id UNIQUEIDENTIFIER NOT NULL,
    completed_on DATE NOT NULL,
    awarded DECIMAL(10,2) NOT NULL DEFAULT 0,
    late BIT NOT NULL DEFAULT 0,
    ledger_id UNIQUEIDENTIFIER NULL,
    ts_created DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_quest_task_completions_task
      FOREIGN KEY (task_id) REFERENCES dbo.quest_tasks(id) ON DELETE CASCADE,
    CONSTRAINT uq_quest_task_completions_task_date UNIQUE (task_id, completed_on)
  );
  CREATE INDEX ix_quest_task_completions_user_date ON dbo.quest_task_completions(user_id, completed_on);
END;

-- Per-task Discord reminders. A task can have any number of fire times (HH:MM, server local —
-- America/Chicago in this deployment). The in-process scheduler (digestScheduler.ts) checks each
-- minute for rows whose fire_time has arrived and whose owning task is "active today" (scheduled
-- and not yet completed, freeze-day excluded). last_fired_date is stamped after a successful
-- notify so the same reminder fires at most once per calendar day.
IF OBJECT_ID('dbo.quest_task_reminders', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quest_task_reminders (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    task_id UNIQUEIDENTIFIER NOT NULL,
    fire_time TIME(0) NOT NULL,
    -- Optional one-shot date. NULL = recurring (every day the parent task is "active today" —
    -- the only mode that makes sense for dailies). Non-NULL = fire only on that exact date,
    -- intended for todos that should ping at a specific time on a specific day.
    fire_date DATE NULL,
    last_fired_date DATE NULL,
    ts_created DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT fk_quest_task_reminders_task
      FOREIGN KEY (task_id) REFERENCES dbo.quest_tasks(id) ON DELETE CASCADE
  );
  CREATE INDEX ix_quest_task_reminders_task ON dbo.quest_task_reminders(task_id);
  CREATE INDEX ix_quest_task_reminders_fire ON dbo.quest_task_reminders(fire_time, last_fired_date);
END;

-- Note: the `modules` row registering Quest in the dashboard lives in the MAIN DB
-- (GRIMOIRE-MAIN-20260325.dbo.modules), not here. This schema is for the dedicated
-- GRIMOIRE-QUEST-* database, which holds only the quest_* tables.
