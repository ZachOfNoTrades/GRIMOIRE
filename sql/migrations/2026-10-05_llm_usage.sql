-- 2026-10-05  GRIMOIRE-MAIN
-- One row per model call (both backends: the shared Claude CLI and the user's own
-- OpenRouter key). Counts, cost and timing only — never prompt or reply text.
-- Backs Settings → AI (summary strip) and the Usage page; reads are always one user's.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='llm_usage' AND xtype='U')
BEGIN
  CREATE TABLE dbo.llm_usage (
    id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_llm_usage_id DEFAULT NEWSEQUENTIALID(),
    user_id UNIQUEIDENTIFIER NOT NULL,
    task NVARCHAR(40) NOT NULL,
    backend NVARCHAR(16) NOT NULL,          -- claude | openrouter
    model NVARCHAR(120) NOT NULL,
    prompt_tokens INT NOT NULL CONSTRAINT DF_llm_usage_prompt DEFAULT 0,
    completion_tokens INT NOT NULL CONSTRAINT DF_llm_usage_completion DEFAULT 0,
    cost_usd DECIMAL(12,6) NULL,            -- OpenRouter usage.cost / CLI total_cost_usd
    duration_ms INT NOT NULL CONSTRAINT DF_llm_usage_duration DEFAULT 0,
    ok BIT NOT NULL CONSTRAINT DF_llm_usage_ok DEFAULT 1,
    error_code NVARCHAR(40) NULL,
    ts DATETIME2 NOT NULL CONSTRAINT DF_llm_usage_ts DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_llm_usage PRIMARY KEY (id),
    CONSTRAINT FK_llm_usage_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE
  );
  CREATE INDEX IX_llm_usage_user_ts ON dbo.llm_usage (user_id, ts DESC);
END;
GO
