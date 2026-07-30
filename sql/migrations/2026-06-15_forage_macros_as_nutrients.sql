-- =====================================================================
-- Forage: migrate macros (calories/protein/carbs/fat) into the nutrient model
-- =====================================================================
-- Phase 1 (additive, reversible): make the 4 macros first-class `nutrients`
-- rows so every nutrient-keyed surface (the /nutrition/[code] detail page,
-- foods-highest rankings, the dashboard navCodes/clickable cards, food
-- breakdowns) resolves them automatically — the UI already keys off the
-- `nutrients` table + `food_nutrients` EAV. This does NOT yet remove the
-- legacy fast-path columns (foods.*_per_serving, food_entries.quick_add_*,
-- macro_targets) — totals/forms still read those. A later phase flips the
-- source of truth and drops the columns. Until then the macro amount lives
-- in BOTH places; nothing sums both (totals come from the columns; the
-- macro `nutrients` rows use category='macro', excluded from the
-- vitamin/mineral/other section loops), so there is no double counting.
--
-- Idempotent + re-runnable. Run against the forage DB (GRIMOIRE-FOOD-*).
-- Reverse: DELETE FROM food_nutrients WHERE nutrient_id IN (macro ids);
--          DELETE FROM nutrients WHERE category='macro'; then restore the
--          original 3-value category check constraint.
-- =====================================================================

SET XACT_ABORT ON;
BEGIN TRAN;

-- 1) Allow the new 'macro' category. -----------------------------------
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'chk_nutrients_category')
    ALTER TABLE nutrients DROP CONSTRAINT chk_nutrients_category;
ALTER TABLE nutrients ADD CONSTRAINT chk_nutrients_category
    CHECK (category IN ('macro','vitamin','mineral','other'));

-- 2) Seed the 4 macro nutrient rows. -----------------------------------
-- Order matches the app's MACRO array (kcal, protein, fat, carbs) and is
-- kept ahead of the micros (which start at display_order 10). The macro
-- "target" is the ideal-to-hit amount; per-user/program targets layer on
-- top via macro_targets today (and nutrient_targets after the target-model
-- unification). default_target = FDA DV as the fallback shown before a
-- program is set. No floor/ceiling — a macro is a reach-a-goal value.
;WITH macro(code, name, unit, daily_value, display_order) AS (
    SELECT * FROM (VALUES
        ('kcal',    'Calories', 'kcal', 2000, 1),
        ('protein', 'Protein',  'g',    50,   2),
        ('fat',     'Fat',      'g',    78,   3),
        ('carbs',   'Carbs',    'g',    275,  4)
    ) AS t(code, name, unit, daily_value, display_order)
)
MERGE nutrients AS tgt
USING macro AS src ON tgt.code = src.code
WHEN MATCHED THEN UPDATE SET
    name            = src.name,
    category        = 'macro',
    unit            = src.unit,
    daily_value     = src.daily_value,
    default_floor   = NULL,
    default_target  = src.daily_value,
    default_ceiling = NULL,
    display_order   = src.display_order,
    is_active       = 1
WHEN NOT MATCHED THEN INSERT (code, name, category, unit, daily_value, default_floor, default_target, default_ceiling, display_order, is_active)
    VALUES (src.code, src.name, 'macro', src.unit, src.daily_value, NULL, src.daily_value, NULL, src.display_order, 1);

-- 3) Backfill food_nutrients from the legacy per-serving macro columns. -
-- One row per (food, macro) where the amount is > 0, matching the micro
-- convention (absent row = 0). Re-runnable: only inserts missing rows and
-- refreshes amounts that drifted. The amount is the per-canonical-serving
-- figure, exactly like the columns it mirrors.
;WITH macro_src(code, amount, food_id) AS (
    SELECT 'kcal',    kcal_per_serving,      id FROM foods WHERE kcal_per_serving      > 0
    UNION ALL SELECT 'protein', protein_g_per_serving, id FROM foods WHERE protein_g_per_serving > 0
    UNION ALL SELECT 'fat',     fat_g_per_serving,     id FROM foods WHERE fat_g_per_serving     > 0
    UNION ALL SELECT 'carbs',   carbs_g_per_serving,   id FROM foods WHERE carbs_g_per_serving   > 0
)
MERGE food_nutrients AS tgt
USING (
    SELECT ms.food_id, n.id AS nutrient_id, CAST(ms.amount AS DECIMAL(12,4)) AS amount
    FROM macro_src ms
    JOIN nutrients n ON n.code = ms.code
) AS src
ON tgt.food_id = src.food_id AND tgt.nutrient_id = src.nutrient_id
WHEN MATCHED THEN UPDATE SET amount = src.amount
WHEN NOT MATCHED THEN INSERT (food_id, nutrient_id, amount)
    VALUES (src.food_id, src.nutrient_id, src.amount);

COMMIT TRAN;

-- Report -------------------------------------------------------------
SELECT code, name, category, unit, default_target, display_order
FROM nutrients WHERE category = 'macro' ORDER BY display_order;
SELECT n.code, COUNT(*) AS food_nutrient_rows
FROM food_nutrients fn JOIN nutrients n ON n.id = fn.nutrient_id
WHERE n.category = 'macro' GROUP BY n.code ORDER BY n.code;
