-- 2026-10-05  GRIMOIRE-MAIN
-- Per-task LLM backend choice. JSON `{ "<task>": { "backend": "claude"|"openrouter",
-- "model": "<openrouter model id>" } }` keyed by nextjs/lib/llm/tasks.ts; a missing
-- task means the default (the shared Claude CLI). Model only applies to OpenRouter.
IF COL_LENGTH('dbo.user_preferences', 'llm_tasks') IS NULL
BEGIN
  ALTER TABLE dbo.user_preferences ADD llm_tasks NVARCHAR(MAX) NULL;
END;
GO
