-- Golem: warmup slots for day archetypes.
-- Adds day_slots.is_warmup so an archetype can carry warmup-exercise slots (mobility/activation/cardio).
-- The deterministic engine fills these from is_warmup exercises (sourced from the active warmup location,
-- else the working location) and emits them as is_warmup segments ordered before the working slots.
-- DEFAULT 0 leaves every existing slot a normal working slot. Run against the GOLEM database.
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'day_slots' AND COLUMN_NAME = 'is_warmup'
)
BEGIN
    ALTER TABLE day_slots
        ADD is_warmup BIT NOT NULL
            CONSTRAINT DF_day_slots_is_warmup DEFAULT 0; -- 1 = a warmup-exercise slot (no load progression)
END
