-- 2026-09-10  GRIMOIRE-MAIN
-- Per-user, app-wide preferences. First setting: `theme` (auto | light | dark),
-- driving the explicit light/dark override on top of the browser's
-- prefers-color-scheme default (see nextjs/lib/useTheme.ts).
--
-- One row per user, written on the first preference change; a user with no row
-- uses the app defaults, so this migration intentionally backfills nothing.
-- Module-scoped settings stay in their own module DB (forage_user_settings and
-- friends) — this table is only for settings that apply across the whole app.
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_preferences' AND xtype='U')
BEGIN
  CREATE TABLE dbo.user_preferences (
    user_id UNIQUEIDENTIFIER PRIMARY KEY,
    theme NVARCHAR(10) NOT NULL DEFAULT 'auto',
    ts_created DATETIME DEFAULT GETDATE(),
    ts_updated DATETIME DEFAULT GETDATE(),

    FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT chk_user_preferences_theme CHECK (theme IN ('auto','light','dark'))
  );
END;
GO
