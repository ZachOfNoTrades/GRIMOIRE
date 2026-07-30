-- Adds program_style to forage_program so a program can be either the existing
-- "coached" config (algorithm computes targets + weekly check-in) or a new
-- "manual" style where the user types their own weekly macro targets.
--
-- Manual programs carry none of the coaching inputs, so the coached-only columns
-- become nullable. Existing rows are backfilled to 'coached' via the default.

-- PROGRAM STYLE COLUMN
ALTER TABLE forage_program
    ADD program_style VARCHAR(16) NOT NULL
        CONSTRAINT DF_forage_program_program_style DEFAULT 'coached';
GO

-- COACHED-ONLY COLUMNS BECOME NULLABLE (manual programs leave them NULL)
ALTER TABLE forage_program ALTER COLUMN protein_band      VARCHAR(16) NULL;
ALTER TABLE forage_program ALTER COLUMN diet_kind         VARCHAR(16) NULL;
ALTER TABLE forage_program ALTER COLUMN training_kind     VARCHAR(16) NULL;
ALTER TABLE forage_program ALTER COLUMN distribution_kind VARCHAR(16) NULL;
ALTER TABLE forage_program ALTER COLUMN floor_kind        VARCHAR(16) NULL;
ALTER TABLE forage_program ALTER COLUMN check_in_weekday  TINYINT     NULL;
GO
