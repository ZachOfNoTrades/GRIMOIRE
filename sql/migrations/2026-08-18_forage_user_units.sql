-- =============================================================
-- 2026-08-18 — Forage: per-user custom units of measure.
--
-- `food_units` stays the shared, global catalog of built-in units. This table
-- adds free-text units a single user invented ("stick", "scoop", "sleeve") so
-- their food serving rows can be labeled the way the packaging actually reads.
--
-- `unit_type` is a DISPLAY grouping only — it decides which <optgroup> the unit
-- lands in ('mass' -> Weight, 'volume' -> Volume, 'count' -> Count & other).
-- It deliberately does NOT feed the conversion math in lib/unitFamilies.ts: a
-- made-up unit has no defined size, so it never participates in mass<->mass or
-- volume<->volume conversion regardless of the group it displays under.
-- =============================================================
USE [GRIMOIRE-FOOD-20260520];
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='forage_user_units' AND xtype='U')
BEGIN
    CREATE TABLE forage_user_units (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        user_id UNIQUEIDENTIFIER NOT NULL,
        name NVARCHAR(32) NOT NULL,
        unit_type VARCHAR(8) NOT NULL DEFAULT 'count',
        display_order INT NOT NULL DEFAULT 0,
        ts_created DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_forage_user_units_user_name UNIQUE (user_id, name),
        CONSTRAINT CK_forage_user_units_type CHECK (unit_type IN ('mass','volume','count'))
    );

    CREATE INDEX IX_forage_user_units_user ON forage_user_units (user_id, display_order, name);
END
GO
