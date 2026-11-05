-- Drop the user-editable evaluation system prompt, as the bundled evaluateAnswerSystem.md is always used
IF COL_LENGTH('dbo.rune_settings', 'evaluation_system_prompt') IS NOT NULL
BEGIN
    ALTER TABLE dbo.rune_settings DROP COLUMN evaluation_system_prompt;
END
