IF COL_LENGTH('dbo.rune_settings', 'evaluation_prompt') IS NULL
BEGIN
  ALTER TABLE dbo.rune_settings ADD evaluation_prompt NVARCHAR(MAX) NULL;
END;
GO
