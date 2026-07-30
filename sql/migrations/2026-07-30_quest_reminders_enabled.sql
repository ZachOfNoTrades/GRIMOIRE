-- 2026-07-30  GRIMOIRE-QUEST
-- Task reminders were the one notification with no per-user on/off switch — the digest and
-- bonus-task legs each had one, but reminders fired purely off the per-task rows. Now that every
-- notification is an email with a working unsubscribe link, reminders need a flag the unsubscribe
-- handler can flip (and the settings page can expose).
--
-- Defaults to 1 so existing reminders keep firing exactly as they did before.
IF COL_LENGTH('dbo.quest_settings', 'reminders_enabled') IS NULL
  ALTER TABLE dbo.quest_settings
    ADD reminders_enabled BIT NOT NULL CONSTRAINT DF_quest_settings_reminders_enabled DEFAULT 1;
