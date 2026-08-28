-- =============================================================================
-- GRIMOIRE-HEALTH-20260827 — the app-level master health database.
--
-- Rationale: health data (bodyweight, body fat, height, heart rate, steps,
-- sleep, ...) is not owned by any one module. golem needs bodyweight to
-- prescribe load, forage needs it to run the adaptive-expenditure model, and a
-- future Android app needs a single place to sync Health Connect records into.
-- Carving it into its own database mirrors how QUEST was carved out of MAIN on
-- 2026-05-20: modules keep their dedicated databases and read/write health via
-- lib/health/* (JS-level joins, never three-part cross-DB names — the database
-- name is env-configurable via SQL_HEALTH_DB).
--
-- Idempotent: safe to re-run.
-- =============================================================================

IF DB_ID(N'$(HEALTHDB)') IS NULL
BEGIN
    DECLARE @create nvarchar(max) = N'CREATE DATABASE [' + N'$(HEALTHDB)' + N'] COLLATE Latin1_General_CI_AS_KS_WS';
    EXEC sp_executesql @create;
END
GO

USE [$(HEALTHDB)];
GO

-- === HEALTH_METRIC — the catalog of trackable metrics ========================
-- One row per metric kind. `health_connect_type` is the Android Health Connect
-- record class this maps to, which is what makes the export/import round-trip
-- possible before an Android app exists.
IF OBJECT_ID(N'dbo.health_metric', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.health_metric (
        code                 NVARCHAR(64)   NOT NULL CONSTRAINT PK_health_metric PRIMARY KEY,
        display_name         NVARCHAR(128)  NOT NULL,
        category             NVARCHAR(32)   NOT NULL,   -- body | vitals | activity | sleep | nutrition
        canonical_unit       NVARCHAR(32)   NOT NULL,   -- unit every sample is normalized to on write
        aggregation          NVARCHAR(16)   NOT NULL,   -- latest | sum | avg  (how to roll a day up)
        health_connect_type  NVARCHAR(64)   NULL,       -- Health Connect record type, null = no mapping
        health_connect_field NVARCHAR(64)   NULL,       -- field inside that record carrying the value
        is_interval          BIT            NOT NULL CONSTRAINT DF_health_metric_interval DEFAULT 0,
        sort_order           INT            NOT NULL CONSTRAINT DF_health_metric_sort DEFAULT 100,
        is_active            BIT            NOT NULL CONSTRAINT DF_health_metric_active DEFAULT 1
    );
END
GO

-- === HEALTH_PROFILE — the per-user static profile ============================
-- Slow-changing facts every module wants: age, sex, height, unit preferences.
-- One row per user; created on demand by ensureHealthProfile().
IF OBJECT_ID(N'dbo.health_profile', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.health_profile (
        id                    INT IDENTITY(1,1) CONSTRAINT PK_health_profile PRIMARY KEY,
        user_id               NVARCHAR(128) NOT NULL,
        date_of_birth         DATE          NULL,
        biological_sex        NVARCHAR(16)  NULL,   -- male | female | other | unspecified
        height_cm             DECIMAL(6,2)  NULL,
        blood_type            NVARCHAR(8)   NULL,
        resting_heart_rate    INT           NULL,   -- user-stated baseline; measured values live in samples
        preferred_mass_unit   NVARCHAR(8)   NOT NULL CONSTRAINT DF_health_profile_mass DEFAULT 'lb',
        preferred_height_unit NVARCHAR(8)   NOT NULL CONSTRAINT DF_health_profile_height DEFAULT 'in',
        notes                 NVARCHAR(MAX) NULL,
        created_at            DATETIME2(3)  NOT NULL CONSTRAINT DF_health_profile_created DEFAULT SYSUTCDATETIME(),
        modified_at           DATETIME2(3)  NOT NULL CONSTRAINT DF_health_profile_modified DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_health_profile_user UNIQUE (user_id)
    );
END
GO

-- === HEALTH_SAMPLE — the master time series ==================================
-- Every measurement, from every source, in one table. `source` records which
-- module (or import) produced the row and `source_ref` the row id in that
-- module's own database, so a mirror can be re-synced without duplicating.
IF OBJECT_ID(N'dbo.health_sample', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.health_sample (
        id           BIGINT IDENTITY(1,1) CONSTRAINT PK_health_sample PRIMARY KEY,
        user_id      NVARCHAR(128) NOT NULL,
        metric_code  NVARCHAR(64)  NOT NULL,
        value        FLOAT         NOT NULL,   -- always in the metric's canonical_unit
        start_at     DATETIME2(3)  NOT NULL,   -- UTC instant (or interval start)
        end_at       DATETIME2(3)  NULL,       -- interval end; null for instantaneous samples
        source       NVARCHAR(32)  NOT NULL,   -- manual | forage | golem | health-connect | ...
        source_ref   NVARCHAR(128) NULL,       -- originating row id / external record id
        note         NVARCHAR(512) NULL,
        created_at   DATETIME2(3)  NOT NULL CONSTRAINT DF_health_sample_created DEFAULT SYSUTCDATETIME(),
        modified_at  DATETIME2(3)  NOT NULL CONSTRAINT DF_health_sample_modified DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_health_sample_metric FOREIGN KEY (metric_code) REFERENCES dbo.health_metric (code)
    );
END
GO

-- Idempotency key: one sample per (user, metric, instant, source). This is what
-- lets a Health Connect import and a module mirror both re-run without dupes.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_health_sample_natural' AND object_id = OBJECT_ID(N'dbo.health_sample'))
    CREATE UNIQUE INDEX UQ_health_sample_natural ON dbo.health_sample (user_id, metric_code, start_at, source);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_health_sample_user_metric_time' AND object_id = OBJECT_ID(N'dbo.health_sample'))
    CREATE INDEX IX_health_sample_user_metric_time ON dbo.health_sample (user_id, metric_code, start_at DESC) INCLUDE (value, source);
GO

-- === METRIC CATALOG SEED =====================================================
-- Health Connect record types per developer.android.com/health-and-fitness/guides/health-connect.
MERGE dbo.health_metric AS target
USING (VALUES
    ('body_mass',            'Weight',                'body',      'kg',      'latest', 'Weight',              'weight',            0,  10),
    ('body_fat',             'Body Fat',              'body',      '%',       'latest', 'BodyFat',             'percentage',        0,  20),
    ('lean_body_mass',       'Lean Body Mass',        'body',      'kg',      'latest', 'LeanBodyMass',        'mass',              0,  30),
    ('height',               'Height',                'body',      'cm',      'latest', 'Height',              'height',            0,  40),
    ('waist_circumference',  'Waist Circumference',   'body',      'cm',      'latest', 'WaistCircumference',  'circumference',     0,  50),
    ('bone_mass',            'Bone Mass',             'body',      'kg',      'latest', 'BoneMass',            'mass',              0,  60),
    ('basal_metabolic_rate', 'Basal Metabolic Rate',  'body',      'kcal',    'latest', 'BasalMetabolicRate',  'basalMetabolicRate',0,  70),
    ('heart_rate',           'Heart Rate',            'vitals',    'bpm',     'avg',    'HeartRateSeries',     'beatsPerMinute',    0, 110),
    ('resting_heart_rate',   'Resting Heart Rate',    'vitals',    'bpm',     'latest', 'RestingHeartRate',    'beatsPerMinute',    0, 120),
    ('heart_rate_variability','Heart Rate Variability','vitals',   'ms',      'latest', 'HeartRateVariabilityRmssd', 'heartRateVariabilityMillis', 0, 130),
    ('blood_pressure_systolic',  'Blood Pressure (Systolic)',  'vitals', 'mmHg', 'latest', 'BloodPressure',   'systolic',          0, 140),
    ('blood_pressure_diastolic', 'Blood Pressure (Diastolic)', 'vitals', 'mmHg', 'latest', 'BloodPressure',   'diastolic',         0, 150),
    ('oxygen_saturation',    'Oxygen Saturation',     'vitals',    '%',       'latest', 'OxygenSaturation',    'percentage',        0, 160),
    ('respiratory_rate',     'Respiratory Rate',      'vitals',    'rpm',     'latest', 'RespiratoryRate',     'rate',              0, 170),
    ('body_temperature',     'Body Temperature',      'vitals',    'degC',    'latest', 'BodyTemperature',     'temperature',       0, 180),
    ('blood_glucose',        'Blood Glucose',         'vitals',    'mmol/L',  'latest', 'BloodGlucose',        'level',             0, 190),
    ('vo2_max',              'VO2 Max',               'vitals',    'mL/kg/min','latest','Vo2Max',              'vo2MillilitersPerMinuteKilogram', 0, 200),
    ('steps',                'Steps',                 'activity',  'count',   'sum',    'Steps',               'count',             1, 210),
    ('distance',             'Distance',              'activity',  'm',       'sum',    'Distance',            'distance',          1, 220),
    ('floors_climbed',       'Floors Climbed',        'activity',  'count',   'sum',    'FloorsClimbed',       'floors',            1, 230),
    ('active_calories',      'Active Calories',       'activity',  'kcal',    'sum',    'ActiveCaloriesBurned','energy',            1, 240),
    ('total_calories',       'Total Calories',        'activity',  'kcal',    'sum',    'TotalCaloriesBurned', 'energy',            1, 250),
    ('exercise_duration',    'Exercise Duration',     'activity',  'min',     'sum',    'ExerciseSession',     'duration',          1, 260),
    ('sleep_duration',       'Sleep Duration',        'sleep',     'min',     'sum',    'SleepSession',        'duration',          1, 310),
    ('hydration',            'Hydration',             'nutrition', 'L',       'sum',    'Hydration',           'volume',            1, 410),
    ('energy_intake',        'Energy Intake',         'nutrition', 'kcal',    'sum',    'Nutrition',           'energy',            1, 420),
    ('protein_intake',       'Protein Intake',        'nutrition', 'g',       'sum',    'Nutrition',           'protein',           1, 430)
) AS source (code, display_name, category, canonical_unit, aggregation, health_connect_type, health_connect_field, is_interval, sort_order)
ON target.code = source.code
WHEN MATCHED THEN UPDATE SET
    display_name = source.display_name,
    category = source.category,
    canonical_unit = source.canonical_unit,
    aggregation = source.aggregation,
    health_connect_type = source.health_connect_type,
    health_connect_field = source.health_connect_field,
    is_interval = source.is_interval,
    sort_order = source.sort_order
WHEN NOT MATCHED THEN INSERT (code, display_name, category, canonical_unit, aggregation, health_connect_type, health_connect_field, is_interval, sort_order)
    VALUES (source.code, source.display_name, source.category, source.canonical_unit, source.aggregation, source.health_connect_type, source.health_connect_field, source.is_interval, source.sort_order);
GO
