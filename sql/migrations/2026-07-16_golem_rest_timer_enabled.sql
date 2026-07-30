-- Golem rest timer toggle (2026-07-16)
-- Makes the between-sets rest countdown a per-user setting. Previously it always fired with no way to
-- turn it off. Defaults to 1 so existing users keep the current behaviour.
-- Run against the GOLEM database. Idempotent — safe to re-run.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('user_profiles') AND name = 'rest_timer_enabled')
    ALTER TABLE user_profiles ADD rest_timer_enabled BIT NOT NULL CONSTRAINT DF_user_profiles_rest_timer_enabled DEFAULT 1;
