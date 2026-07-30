-- Re-scope nutrient_targets from per-USER to per-PROGRAM.
--
-- A nutrient override (custom floor/target/ceiling) now belongs to a
-- forage_program — the concrete nutrition plan — paralleling how the active
-- program drives the macro plan (macro_targets). Resolution reads the active
-- program's rows; createProgram carries the prior plan's overrides forward.
--
-- The table is empty in every environment (the editor shipped 2026-06-09 with no
-- rows yet), so this is a clean drop & recreate rather than a backfill. The PK
-- moves from (user_id, nutrient_id) to (program_id, nutrient_id); user_id is
-- dropped (derivable via forage_program.user_id). ON DELETE CASCADE so a hard
-- program delete also clears its overrides (programs are normally soft-ended).

IF OBJECT_ID('nutrient_targets', 'U') IS NOT NULL
    DROP TABLE nutrient_targets;
GO

CREATE TABLE nutrient_targets (
    program_id  UNIQUEIDENTIFIER NOT NULL,
    nutrient_id UNIQUEIDENTIFIER NOT NULL,
    floor       DECIMAL(12,4) NULL,
    target      DECIMAL(12,4) NULL,
    ceiling     DECIMAL(12,4) NULL,
    updated_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_nutrient_targets PRIMARY KEY (program_id, nutrient_id),
    CONSTRAINT FK_nutrient_targets_program FOREIGN KEY (program_id) REFERENCES forage_program(id) ON DELETE CASCADE,
    CONSTRAINT FK_nutrient_targets_nutrient FOREIGN KEY (nutrient_id) REFERENCES nutrients(id)
);
GO
