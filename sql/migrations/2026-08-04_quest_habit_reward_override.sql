-- 2026-08-04  GRIMOIRE-QUEST
-- Add an optional manual coin-reward override to habits, mirroring quest_tasks.manual_reward_override.
-- NULL = use the per-difficulty factor from settings; a non-null value replaces the positive-tap
-- reward for this habit only (negative-tap coin damage / HP damage stay difficulty-driven).
IF COL_LENGTH('dbo.quest_habits', 'manual_reward_override') IS NULL
BEGIN
  ALTER TABLE dbo.quest_habits ADD manual_reward_override DECIMAL(10, 2) NULL;
END;
