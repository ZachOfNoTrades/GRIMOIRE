-- Add a limit on how many days a user may freeze in each period
IF COL_LENGTH('dbo.quest_settings', 'is_freeze_limited') IS NULL
BEGIN
    -- Determines if freezes are limited. 0 = any number of days may be frozen, 1 = at most freeze_limit days per freeze_period
    ALTER TABLE dbo.quest_settings ADD is_freeze_limited BIT NOT NULL
        CONSTRAINT DF_quest_settings_is_freeze_limited DEFAULT 0;
END
GO

IF COL_LENGTH('dbo.quest_settings', 'freeze_limit') IS NULL
BEGIN
    -- Days that may be frozen in each freeze_period when is_freeze_limited = 1. 2 = two frozen days per period
    ALTER TABLE dbo.quest_settings ADD freeze_limit INT NOT NULL
        CONSTRAINT DF_quest_settings_freeze_limit DEFAULT 2;
END
GO

IF COL_LENGTH('dbo.quest_settings', 'freeze_period') IS NULL
BEGIN
    -- The span freeze_limit counts over. 0 = quest week, 1 = calendar month, 2 = calendar year
    ALTER TABLE dbo.quest_settings ADD freeze_period TINYINT NOT NULL
        CONSTRAINT DF_quest_settings_freeze_period DEFAULT 1;
END
GO

-- Refuse a negative limit or an unknown period
IF OBJECT_ID('dbo.CK_quest_settings_freeze_limit', 'C') IS NULL
BEGIN
    ALTER TABLE dbo.quest_settings ADD CONSTRAINT CK_quest_settings_freeze_limit CHECK (freeze_limit BETWEEN 0 AND 366);
END
GO

IF OBJECT_ID('dbo.CK_quest_settings_freeze_period', 'C') IS NULL
BEGIN
    ALTER TABLE dbo.quest_settings ADD CONSTRAINT CK_quest_settings_freeze_period CHECK (freeze_period IN (0, 1, 2));
END
GO
