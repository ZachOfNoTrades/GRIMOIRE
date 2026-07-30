-- =====================================================================
-- Forage macros→nutrients, Phase 5: drop legacy macro storage
-- =====================================================================
-- All macro READS + WRITES now go through the nutrient model:
--   • food macros      → food_nutrients (category='macro' rows)
--   • quick-add macros → food_entry_nutrients
--   • macro targets    → nutrient_targets_v2 (scope='macro', with history)
--   • micro bands      → nutrient_targets_v2 (scope='micro')
-- This migration removes the now-unused legacy storage. Data was migrated +
-- verified in Phases 1–4, so there is no loss here — only redundant copies go.
--
-- Drops:
--   • foods.{kcal,protein_g,carbs_g,fat_g}_per_serving (+ their DEFAULT 0 constraints)
--   • food_entries.quick_add_{kcal,protein_g,carbs_g,fat_g}  (quick_add_name kept)
--   • table macro_targets               (history now in nutrient_targets_v2)
--   • table nutrient_targets            (superseded by nutrient_targets_v2)
-- Rewrites chk_food_entries_food_or_quick to require quick_add_name only.
--
-- Idempotent (guarded by COL_LENGTH / OBJECT_ID). NOT reversible (drops data) —
-- restore from backup if needed. Run against the forage DB (GRIMOIRE-FOOD-*).
-- =====================================================================

SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
BEGIN TRAN;

-- 1) food_entries quick-add macro columns -----------------------------
-- The CHECK references quick_add_kcal, so drop it first, then the columns,
-- then re-add the CHECK requiring only a quick-add NAME.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'chk_food_entries_food_or_quick')
    ALTER TABLE food_entries DROP CONSTRAINT chk_food_entries_food_or_quick;

IF COL_LENGTH('food_entries','quick_add_kcal')      IS NOT NULL ALTER TABLE food_entries DROP COLUMN quick_add_kcal;
IF COL_LENGTH('food_entries','quick_add_protein_g') IS NOT NULL ALTER TABLE food_entries DROP COLUMN quick_add_protein_g;
IF COL_LENGTH('food_entries','quick_add_carbs_g')   IS NOT NULL ALTER TABLE food_entries DROP COLUMN quick_add_carbs_g;
IF COL_LENGTH('food_entries','quick_add_fat_g')     IS NOT NULL ALTER TABLE food_entries DROP COLUMN quick_add_fat_g;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'chk_food_entries_food_or_quick')
    ALTER TABLE food_entries ADD CONSTRAINT chk_food_entries_food_or_quick
        CHECK (food_id IS NOT NULL OR quick_add_name IS NOT NULL);

-- 2) foods macro columns ----------------------------------------------
-- DROP COLUMN fails while a DEFAULT constraint binds the column, and those
-- defaults were auto-named — discover + drop them dynamically first.
DECLARE @drop NVARCHAR(MAX) = N'';
SELECT @drop += 'ALTER TABLE foods DROP CONSTRAINT ' + QUOTENAME(dc.name) + ';'
FROM sys.default_constraints dc
JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID('foods')
  AND c.name IN ('kcal_per_serving','protein_g_per_serving','carbs_g_per_serving','fat_g_per_serving');
IF @drop <> N'' EXEC sp_executesql @drop;

IF COL_LENGTH('foods','kcal_per_serving')      IS NOT NULL ALTER TABLE foods DROP COLUMN kcal_per_serving;
IF COL_LENGTH('foods','protein_g_per_serving') IS NOT NULL ALTER TABLE foods DROP COLUMN protein_g_per_serving;
IF COL_LENGTH('foods','carbs_g_per_serving')   IS NOT NULL ALTER TABLE foods DROP COLUMN carbs_g_per_serving;
IF COL_LENGTH('foods','fat_g_per_serving')     IS NOT NULL ALTER TABLE foods DROP COLUMN fat_g_per_serving;

-- 3) legacy target tables ---------------------------------------------
IF OBJECT_ID('macro_targets','U')   IS NOT NULL DROP TABLE macro_targets;     -- history → nutrient_targets_v2 (scope='macro')
IF OBJECT_ID('nutrient_targets','U') IS NOT NULL DROP TABLE nutrient_targets; -- superseded by nutrient_targets_v2 (scope='micro')

COMMIT TRAN;

-- Report: confirm the columns/tables are gone.
SELECT
  COL_LENGTH('foods','kcal_per_serving')              AS foods_kcal_col,        -- expect NULL
  COL_LENGTH('food_entries','quick_add_kcal')         AS entries_qa_kcal_col,   -- expect NULL
  OBJECT_ID('macro_targets','U')                      AS macro_targets_tbl,     -- expect NULL
  OBJECT_ID('nutrient_targets','U')                   AS nutrient_targets_tbl;  -- expect NULL
