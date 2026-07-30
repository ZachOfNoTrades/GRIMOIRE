-- Configurable "all dailies complete" bonus.
--
-- Pays a flat, configurable coin bonus once per day the moment every daily task scheduled for
-- "today" (occurrence due + not yet done) becomes done. Mirrors the shape of the existing
-- todo_bonus_* / retro_completion_* settings: a master enable + a tunable amount, plus a
-- last-awarded-date column so the payout is idempotent per calendar day (same pattern as
-- digest_last_sent_date / bonus_notif_last_sent_date).

-- ALL-DAILIES BONUS SETTINGS COLUMNS
IF COL_LENGTH('dbo.quest_settings', 'all_dailies_bonus_enabled') IS NULL
BEGIN
  ALTER TABLE dbo.quest_settings
    ADD all_dailies_bonus_enabled BIT NOT NULL
          CONSTRAINT DF_quest_settings_all_dailies_bonus_enabled DEFAULT 0,
        all_dailies_bonus_amount DECIMAL(10,2) NOT NULL
          CONSTRAINT DF_quest_settings_all_dailies_bonus_amount DEFAULT 5.00,
        all_dailies_bonus_last_awarded_date DATE NULL;
END;
GO
