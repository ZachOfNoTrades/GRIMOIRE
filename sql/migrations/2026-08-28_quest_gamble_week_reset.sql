-- 2026-08-28  GRIMOIRE-QUEST
-- The short-rest ("gamble for health") price escalation now resets WEEKLY instead of daily:
-- the Nth roll of the week costs GAMBLE_COST + GAMBLE_COST_STEP * (N - 1) coins (2, 4, 6, ...),
-- and the counter only clears when the user's chosen week-start weekday comes round again.
--   gamble_week_start_day — weekday the quest week starts on, JS Date.getDay() convention
--                           (0 = Sunday ... 6 = Saturday). Defaults to 1 (Monday).
-- quest_user_state.gamble_rolls_date keeps its meaning (the quest day of the most recent roll);
-- it is now read as "still inside the current week" rather than "is today", so no backfill and
-- no nightly job are needed.
IF COL_LENGTH('dbo.quest_settings', 'gamble_week_start_day') IS NULL
BEGIN
  ALTER TABLE dbo.quest_settings
    ADD gamble_week_start_day TINYINT NOT NULL CONSTRAINT df_quest_settings_gamble_week_start_day DEFAULT 1;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_quest_settings_gamble_week_start_day')
BEGIN
  ALTER TABLE dbo.quest_settings
    ADD CONSTRAINT ck_quest_settings_gamble_week_start_day CHECK (gamble_week_start_day BETWEEN 0 AND 6);
END;
GO
