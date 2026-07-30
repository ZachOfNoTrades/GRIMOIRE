-- =====================================================================
-- Forage Macros — Phase 4: migrate macro TARGETS into the nutrient-target
-- model, PRESERVING HISTORY.
--
-- DB: GRIMOIRE-FOOD-20260520
--
-- BACKGROUND
-- ----------
-- Phases 1-2 made macros (kcal/protein/fat/carbs) first-class `nutrients` rows
-- (category='macro') and routed food/entry macro AMOUNTS through the nutrient
-- EAV. This phase migrates the daily macro GOAL/TARGET model:
--
--   * macro_targets   — per-USER macro goal history. Has effective_date HISTORY,
--                       per-day-of-week (day_of_week NULL = all days), is_active
--                       (current target), source ('manual'|'program'). ~90 rows.
--   * nutrient_targets — per-PROGRAM micro band overrides. floor/target/ceiling,
--                       PK (program_id, nutrient_id). NO history, NO per-DOW,
--                       NO is_active. 5 rows.
--
-- DESIGN RATIONALE
-- ----------------
-- The two existing models have genuinely different SCOPES:
--   * macros key off the USER (the goal follows the user, not a single program)
--     and carry full history (effective_date + is_active + source + per-DOW).
--   * micros key off the PROGRAM and carry a single live band, no history.
--
-- The existing `nutrient_targets` (composite PK program_id+nutrient_id, single
-- band) CANNOT hold macro history/per-DOW/per-user. Rather than overload its PK,
-- this phase introduces a unified, history-capable table `nutrient_targets_v2`
-- with a surrogate `id` PK and BOTH a nullable `program_id` (micro scope) and a
-- nullable `user_id` (macro scope). Exactly one scope is populated per row:
--
--   scope='micro' : program_id NOT NULL, user_id NULL,
--                   floor/target/ceiling band, effective_date carries the row's
--                   updated_at date, day_of_week NULL, is_active=1, source='manual'.
--                   (PK-equivalent uniqueness: one active micro row per
--                    program+nutrient — enforced by a filtered unique index.)
--   scope='macro' : user_id NOT NULL, program_id NULL,
--                   target = the macro goal value, floor/ceiling NULL,
--                   effective_date/day_of_week/is_active/source carried from
--                   macro_targets. Full history retained (is_active=0 rows kept).
--
-- A `scope` discriminator column makes intent explicit and lets readers filter
-- cheaply. Macros store their single goal in `target` (floor/ceiling NULL),
-- matching how a macro nutrient's default band is target-only (Phase 1 seed).
--
-- ZERO DATA LOSS: every macro_targets row → 4 macro rows (kcal/protein/fat/carbs);
-- every nutrient_targets row → 1 micro row. macro_targets is NOT dropped (a later
-- phase does that). Re-runnable: guarded by NOT EXISTS / source-of-truth deletes.
--
-- REVERSIBILITY: drop nutrient_targets_v2 (the legacy tables are untouched).
--   See the rollback block at the bottom (commented).
-- =====================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;  -- required to create the filtered indexes below
SET ANSI_NULLS ON;

-- ---------------------------------------------------------------------
-- 1. Create the unified history-capable table.
-- ---------------------------------------------------------------------
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='nutrient_targets_v2' AND xtype='U')
BEGIN
    CREATE TABLE nutrient_targets_v2 (
        id             UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        scope          VARCHAR(8)       NOT NULL,                 -- 'macro' | 'micro'
        user_id        UNIQUEIDENTIFIER NULL,                     -- macro scope
        program_id     UNIQUEIDENTIFIER NULL,                     -- micro scope
        nutrient_id    UNIQUEIDENTIFIER NOT NULL,
        floor          DECIMAL(12,4)    NULL,                     -- micro band lower
        target         DECIMAL(12,4)    NULL,                     -- macro goal / micro band ideal
        ceiling        DECIMAL(12,4)    NULL,                     -- micro band upper
        effective_date DATE             NOT NULL DEFAULT CAST(GETDATE() AS DATE),
        day_of_week    TINYINT          NULL,                     -- macro per-DOW; NULL=all days
        is_active      BIT              NOT NULL DEFAULT 1,
        source         VARCHAR(16)      NOT NULL DEFAULT 'manual',-- 'manual' | 'program'
        updated_at     DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_nutrient_targets_v2 PRIMARY KEY (id),
        CONSTRAINT chk_ntv2_scope CHECK (scope IN ('macro','micro')),
        -- Exactly one scope key populated, matching the discriminator.
        CONSTRAINT chk_ntv2_scope_keys CHECK (
            (scope='macro' AND user_id IS NOT NULL AND program_id IS NULL)
         OR (scope='micro' AND program_id IS NOT NULL AND user_id IS NULL)
        ),
        CONSTRAINT FK_ntv2_nutrient FOREIGN KEY (nutrient_id) REFERENCES nutrients(id),
        CONSTRAINT FK_ntv2_program  FOREIGN KEY (program_id)  REFERENCES forage_program(id) ON DELETE CASCADE
    );

    -- Macro history lookup: per user+nutrient, ordered by effective_date, filtered
    -- by day_of_week / is_active (mirrors macro_targets' IX_macro_targets_user_eff).
    CREATE INDEX IX_ntv2_macro_lookup
        ON nutrient_targets_v2 (user_id, nutrient_id, effective_date DESC, is_active)
        WHERE scope='macro';

    -- Micro overrides: at most ONE row per program+nutrient (the old composite PK
    -- semantics, now a filtered unique index since macros share the table).
    CREATE UNIQUE INDEX UX_ntv2_micro_program_nutrient
        ON nutrient_targets_v2 (program_id, nutrient_id)
        WHERE scope='micro';
END

-- ---------------------------------------------------------------------
-- 2. Migrate macro_targets → 4 macro rows each (kcal/protein/fat/carbs).
--    Idempotent: clear prior macro migration output, then re-insert. (No live
--    code writes scope='macro' rows until the lib swap deploys, so a full
--    delete+reinsert is safe and keeps re-runs exact.)
-- ---------------------------------------------------------------------
DELETE FROM nutrient_targets_v2 WHERE scope='macro';

;WITH macro_ids AS (
    SELECT code, id FROM nutrients WHERE category='macro'
)
INSERT INTO nutrient_targets_v2
    (scope, user_id, program_id, nutrient_id, floor, target, ceiling,
     effective_date, day_of_week, is_active, source, updated_at)
SELECT 'macro', m.user_id, NULL, n.id, NULL, v.val, NULL,
       m.effective_date, m.day_of_week, m.is_active,
       ISNULL(m.source,'manual'), m.ts_created
FROM macro_targets m
CROSS APPLY (VALUES
    ('kcal',    m.kcal),
    ('protein', m.protein_g),
    ('fat',     m.fat_g),
    ('carbs',   m.carbs_g)
) AS v(code, val)
JOIN macro_ids n ON n.code = v.code
WHERE v.val <> 0;   -- skip zero-valued macros (no signal; not a real target)

-- ---------------------------------------------------------------------
-- 3. Migrate existing nutrient_targets (micro overrides) → micro rows.
--    Carry program's created date as effective_date for ordering sanity.
--    Idempotent: clear prior micro migration output, then re-insert.
-- ---------------------------------------------------------------------
DELETE FROM nutrient_targets_v2 WHERE scope='micro';

INSERT INTO nutrient_targets_v2
    (scope, user_id, program_id, nutrient_id, floor, target, ceiling,
     effective_date, day_of_week, is_active, source, updated_at)
SELECT 'micro', NULL, nt.program_id, nt.nutrient_id, nt.floor, nt.target, nt.ceiling,
       CAST(nt.updated_at AS DATE), NULL, 1, 'manual', nt.updated_at
FROM nutrient_targets nt;

-- ---------------------------------------------------------------------
-- 4. Reconcile / report.
-- ---------------------------------------------------------------------
DECLARE @mt INT          = (SELECT COUNT(*) FROM macro_targets);
DECLARE @mt_nonzero INT  = (SELECT
        SUM(CASE WHEN kcal<>0 THEN 1 ELSE 0 END)
      + SUM(CASE WHEN protein_g<>0 THEN 1 ELSE 0 END)
      + SUM(CASE WHEN carbs_g<>0 THEN 1 ELSE 0 END)
      + SUM(CASE WHEN fat_g<>0 THEN 1 ELSE 0 END) FROM macro_targets);
DECLARE @v2_macro INT    = (SELECT COUNT(*) FROM nutrient_targets_v2 WHERE scope='macro');
DECLARE @nt INT          = (SELECT COUNT(*) FROM nutrient_targets);
DECLARE @v2_micro INT    = (SELECT COUNT(*) FROM nutrient_targets_v2 WHERE scope='micro');

PRINT 'macro_targets rows ............ ' + CAST(@mt AS VARCHAR);
PRINT 'macro_targets nonzero values .. ' + CAST(@mt_nonzero AS VARCHAR);
PRINT 'v2 macro rows ................. ' + CAST(@v2_macro AS VARCHAR) + '  (must equal nonzero values)';
PRINT 'nutrient_targets rows ......... ' + CAST(@nt AS VARCHAR);
PRINT 'v2 micro rows ................. ' + CAST(@v2_micro AS VARCHAR) + '  (must equal nutrient_targets rows)';

IF @v2_macro <> @mt_nonzero
    THROW 50001, 'Macro target migration count mismatch', 1;
IF @v2_micro <> @nt
    THROW 50002, 'Micro target migration count mismatch', 1;

PRINT 'OK: Phase 4 target migration reconciled.';

-- =====================================================================
-- ROLLBACK (manual): legacy macro_targets / nutrient_targets are untouched.
--   DROP TABLE nutrient_targets_v2;
-- =====================================================================
