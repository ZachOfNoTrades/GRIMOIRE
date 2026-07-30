-- 2026-07-23  GRIMOIRE-GOLEM
-- Per-user temporary exercise holds (injury / contraindication).
-- A hold removes an exercise from the deterministic generator's candidate pool for that user,
-- across ALL locations (unlike location_exercise_overrides, which is per-location equipment gating).
--   disabled_until IS NULL  -> permanent hold
--   disabled_until > now     -> held until that instant, then auto-re-enables (no cleanup job needed)
--   disabled_until <= now     -> expired; treated as enabled
IF OBJECT_ID('dbo.user_exercise_holds', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.user_exercise_holds (
    id             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    user_id        UNIQUEIDENTIFIER NOT NULL,
    exercise_id    UNIQUEIDENTIFIER NOT NULL,
    disabled_until DATETIME2        NULL,          -- NULL = permanent; else held until this instant
    reason         NVARCHAR(200)    NULL,          -- optional note (e.g. "L5-S1 deload")
    created_at     DATETIME2        NULL DEFAULT GETDATE(),
    modified_at    DATETIME2        NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_user_exercise_holds UNIQUE (user_id, exercise_id)
  );

  -- Covers the engine's per-user NOT EXISTS probe.
  CREATE INDEX IX_user_exercise_holds_user
    ON dbo.user_exercise_holds (user_id, exercise_id) INCLUDE (disabled_until);
END
