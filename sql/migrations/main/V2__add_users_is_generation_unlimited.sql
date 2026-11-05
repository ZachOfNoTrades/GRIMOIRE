-- Add a flag that lifts a user's generation limit
IF COL_LENGTH('dbo.users', 'is_generation_unlimited') IS NULL
BEGIN
    ALTER TABLE dbo.users ADD is_generation_unlimited BIT NOT NULL
        CONSTRAINT DF_users_is_generation_unlimited DEFAULT 0;
END
GO

-- Mark users with a generation limit of 0 as unlimited
UPDATE dbo.users
SET is_generation_unlimited = 1
WHERE generation_limit = 0 AND is_generation_unlimited = 0;
GO

-- Refuse a negative generation limit
IF OBJECT_ID('dbo.CK_users_generation_limit', 'C') IS NULL
BEGIN
    ALTER TABLE dbo.users ADD CONSTRAINT CK_users_generation_limit CHECK (generation_limit >= 0);
END
GO
