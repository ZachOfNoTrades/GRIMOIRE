-- 2026-08-09  GRIMOIRE-QUEST
-- Short-rest ("gamble for health") rolls now get progressively more expensive within a day:
-- the Nth roll of the day costs GAMBLE_COST + GAMBLE_COST_STEP * (N - 1) coins (2, 4, 6, ...),
-- and the escalation resets on the next quest day.
--   gamble_rolls_date  — the quest day (honours quest_settings.simulation_date) the counter belongs
--                        to. When it isn't today, the count reads as 0 — no nightly job needed.
--   gamble_rolls_count — how many short rests were rolled on that day.
IF COL_LENGTH('dbo.quest_user_state', 'gamble_rolls_date') IS NULL
BEGIN
  ALTER TABLE dbo.quest_user_state ADD gamble_rolls_date DATE NULL;
END;
GO

IF COL_LENGTH('dbo.quest_user_state', 'gamble_rolls_count') IS NULL
BEGIN
  ALTER TABLE dbo.quest_user_state
    ADD gamble_rolls_count INT NOT NULL CONSTRAINT df_quest_user_state_gamble_rolls_count DEFAULT 0;
END;
GO
