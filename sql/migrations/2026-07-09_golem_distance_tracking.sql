-- Golem distance tracking (2026-07-09)
-- Adds an optional per-set distance metric (stored in METERS as the canonical base unit) plus a
-- per-exercise distance modality flag and a per-user display-unit preference (short: feet/yards/meters,
-- long: km/mi). Run against the GOLEM database. Idempotent — safe to re-run.

-- Exercise-level modality: NULL = no distance tracking, 'short' = feet/yards/meters, 'long' = km/mi.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('exercises') AND name = 'distance_type')
    ALTER TABLE exercises ADD distance_type NVARCHAR(10) NULL;

-- Logged set distance, stored in meters.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('session_segment_sets') AND name = 'distance')
    ALTER TABLE session_segment_sets ADD distance DECIMAL(10,3) NULL;

-- Prescribed (target) set distance, stored in meters.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('target_session_segment_sets') AND name = 'distance')
    ALTER TABLE target_session_segment_sets ADD distance DECIMAL(10,3) NULL;

-- Per-user display-unit preferences (NULL falls back to 'meters' / 'km' in the app).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('user_profiles') AND name = 'distance_unit_short')
    ALTER TABLE user_profiles ADD distance_unit_short NVARCHAR(10) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('user_profiles') AND name = 'distance_unit_long')
    ALTER TABLE user_profiles ADD distance_unit_long NVARCHAR(10) NULL;
