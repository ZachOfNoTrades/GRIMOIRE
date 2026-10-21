-- Golem pre-workout toggle (2026-10-21)
-- Makes the pre-workout wizard (survey, warmups, fatigue) a per-user setting. Defaults to 1 so
-- existing users keep the wizard on Start Workout.
-- Run against the GOLEM database. Idempotent — safe to re-run.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('user_profiles') AND name = 'pre_workout_enabled')
    ALTER TABLE user_profiles ADD pre_workout_enabled BIT NOT NULL CONSTRAINT DF_user_profiles_pre_workout_enabled DEFAULT 1;
