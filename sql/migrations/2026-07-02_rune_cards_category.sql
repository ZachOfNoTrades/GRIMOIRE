IF COL_LENGTH('dbo.cards', 'category') IS NULL
BEGIN
  ALTER TABLE dbo.cards ADD category NVARCHAR(100) NULL;
END;
GO
