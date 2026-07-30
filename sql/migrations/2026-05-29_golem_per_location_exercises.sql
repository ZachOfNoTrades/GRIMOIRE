-- =============================
-- Migration: per-location enabled exercises + default/bodyweight-only locations
-- Date: 2026-05-29
-- Idempotent. Run against the live GOLEM database. Schema changes here are mirrored
-- in sql/sql_init_golem.sql (authoritative for fresh installs).
-- =============================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;

-- 1. locations.is_default
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('locations') AND name = 'is_default')
BEGIN
    ALTER TABLE locations ADD is_default BIT NOT NULL CONSTRAINT DF_locations_is_default DEFAULT 0;
END

-- 2. locations.bodyweight_only
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('locations') AND name = 'bodyweight_only')
BEGIN
    ALTER TABLE locations ADD bodyweight_only BIT NOT NULL CONSTRAINT DF_locations_bodyweight_only DEFAULT 0;
END

-- 2b. locations.is_warmup_active — separate warmup-location pointer (warmup at one location, working at another)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('locations') AND name = 'is_warmup_active')
BEGIN
    ALTER TABLE locations ADD is_warmup_active BIT NOT NULL CONSTRAINT DF_locations_is_warmup_active DEFAULT 0;
END
GO
-- 3. one-default-per-user filtered unique index
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_locations_default_per_user' AND object_id = OBJECT_ID('locations'))
BEGIN
    CREATE UNIQUE INDEX UX_locations_default_per_user ON locations (user_id) WHERE is_default = 1;
END
GO
-- 3b. one-warmup-active-per-user filtered unique index
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_locations_warmup_active_per_user' AND object_id = OBJECT_ID('locations'))
BEGIN
    CREATE UNIQUE INDEX UX_locations_warmup_active_per_user ON locations (user_id) WHERE is_warmup_active = 1;
END
GO

-- 4. location_exercise_overrides table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'location_exercise_overrides' AND xtype = 'U')
BEGIN
    CREATE TABLE location_exercise_overrides (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        location_id UNIQUEIDENTIFIER NOT NULL,
        exercise_id UNIQUEIDENTIFIER NOT NULL,
        is_disabled BIT NOT NULL DEFAULT 0,
        created_at DATETIME2 DEFAULT GETDATE(),
        modified_at DATETIME2 DEFAULT GETDATE(),

        CONSTRAINT FK_location_exercise_overrides_location FOREIGN KEY (location_id) REFERENCES locations(id),
        CONSTRAINT FK_location_exercise_overrides_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id),
        CONSTRAINT UQ_location_exercise_override UNIQUE (location_id, exercise_id)
    );
END

-- 5. ensure every user with locations has exactly one default location
;WITH ranked AS (
    SELECT id, user_id,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY is_active DESC, sort_order, name) AS rn
    FROM locations
)
UPDATE l
SET l.is_default = 1
FROM locations l
JOIN ranked r ON r.id = l.id
WHERE r.rn = 1
  AND NOT EXISTS (SELECT 1 FROM locations d WHERE d.user_id = l.user_id AND d.is_default = 1);

-- 6. backfill per-location disabled state from the legacy global/per-user flags.
--    Effective legacy disabled for a user = COALESCE(override.is_disabled, exercise.is_disabled).
--    Apply to every one of that user's locations so each starts matching the old enabled list.
INSERT INTO location_exercise_overrides (location_id, exercise_id, is_disabled)
SELECT l.id, e.id, 1
FROM locations l
JOIN exercises e ON (e.user_id IS NULL OR e.user_id = l.user_id)
LEFT JOIN user_exercise_overrides o ON o.exercise_id = e.id AND o.user_id = l.user_id
WHERE COALESCE(o.is_disabled, e.is_disabled) = 1
  AND NOT EXISTS (
      SELECT 1 FROM location_exercise_overrides x
      WHERE x.location_id = l.id AND x.exercise_id = e.id
  );

PRINT 'Per-location exercise migration complete.';
SELECT 'locations' AS tbl, COUNT(*) AS rows, SUM(CAST(is_default AS INT)) AS defaults FROM locations
UNION ALL
SELECT 'location_exercise_overrides', COUNT(*), SUM(CAST(is_disabled AS INT)) FROM location_exercise_overrides;
