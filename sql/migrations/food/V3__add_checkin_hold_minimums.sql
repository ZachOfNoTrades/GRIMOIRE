-- Add how many of the last 7 days need a complete food log before a check-in changes the targets. 0 = a check-in always changes them, 4 = needs 4 logged days
IF COL_LENGTH('dbo.forage_user_settings', 'checkin_min_logged_days') IS NULL
BEGIN
    ALTER TABLE dbo.forage_user_settings ADD checkin_min_logged_days INT NOT NULL
        CONSTRAINT DF_forage_user_settings_checkin_min_logged_days DEFAULT 4;
END
GO

-- Add how many weigh-ins the last 7 days need before a check-in changes the targets. 0 = a check-in always changes them, 3 = needs 3 weigh-ins
IF COL_LENGTH('dbo.forage_user_settings', 'checkin_min_weigh_ins') IS NULL
BEGIN
    ALTER TABLE dbo.forage_user_settings ADD checkin_min_weigh_ins INT NOT NULL
        CONSTRAINT DF_forage_user_settings_checkin_min_weigh_ins DEFAULT 3;
END
GO

-- Keep both minimums within the 7 days a check-in reviews
IF OBJECT_ID('dbo.chk_forage_user_settings_checkin_minimums', 'C') IS NULL
BEGIN
    ALTER TABLE dbo.forage_user_settings ADD CONSTRAINT chk_forage_user_settings_checkin_minimums
        CHECK (checkin_min_logged_days BETWEEN 0 AND 7 AND checkin_min_weigh_ins BETWEEN 0 AND 7);
END
GO
