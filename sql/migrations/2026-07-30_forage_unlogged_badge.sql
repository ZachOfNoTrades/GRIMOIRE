-- 2026-07-30  GRIMOIRE-FOOD
-- Dashboard "nothing logged yet" badge: the user picks a cutoff time; once the server clock is
-- past it and today's food diary is still empty, the homepage Forage card shows a badge.
-- Enabled by default at 12:00 — the badge is passive (no notification), so opting users in
-- matches what the feature was asked for without a second setup step.
IF COL_LENGTH('dbo.forage_user_settings', 'unlogged_badge_enabled') IS NULL
  ALTER TABLE dbo.forage_user_settings
    ADD unlogged_badge_enabled BIT NOT NULL CONSTRAINT DF_forage_user_settings_unlogged_badge_enabled DEFAULT 1;

IF COL_LENGTH('dbo.forage_user_settings', 'unlogged_badge_time') IS NULL
  ALTER TABLE dbo.forage_user_settings
    ADD unlogged_badge_time TIME(0) NOT NULL CONSTRAINT DF_forage_user_settings_unlogged_badge_time DEFAULT '12:00';
