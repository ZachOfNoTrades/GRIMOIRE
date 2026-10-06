-- 2026-10-06  GRIMOIRE-MAIN
-- App-wide key/value settings set by a global admin (JSON values). First key:
-- `llm_recommended_models` — per-task recommended model overrides for the
-- Settings → AI → Models dropdowns (nextjs/lib/llm/recommendations.ts).
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='app_settings' AND xtype='U')
BEGIN
  CREATE TABLE dbo.app_settings (
    setting_key NVARCHAR(100) NOT NULL,
    setting_value NVARCHAR(MAX) NULL,
    ts_updated DATETIME2 NOT NULL CONSTRAINT DF_app_settings_ts_updated DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_app_settings PRIMARY KEY (setting_key)
  );
END;
GO
