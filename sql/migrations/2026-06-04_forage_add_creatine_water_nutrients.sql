/* ============================================================
   FORAGE — add creatine + water as trackable nutrients (category 'other').

   These live alongside caffeine in the generic "Nutrient Breakdown" bucket —
   no separate category. Creatine is wired onto the existing "Creatine
   Monohydrate" food (5 g/serving). A plain "Water" food is created elsewhere
   (via the foods API) so hydration can be logged.

   Also normalizes the category CHECK constraint back to the canonical three
   buckets, in case a prior run widened it with a (now-removed) 'supplement'.

   Target DB: GRIMOIRE-FOOD-*  (run with that DB as current context).
   Idempotent: safe to re-run.
   ============================================================ */

SET XACT_ABORT ON;
BEGIN TRAN;

/* 1. Drop the category constraint so reclassification can't trip it. */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'chk_nutrients_category')
    ALTER TABLE dbo.nutrients DROP CONSTRAINT chk_nutrients_category;

/* 2. Ensure caffeine is an 'other' nutrient (it was its original home). */
UPDATE dbo.nutrients
   SET category = 'other', display_order = 80
 WHERE code = 'caffeine';

/* 3. Creatine — add if missing, else fold into 'other'. No published DV. */
IF NOT EXISTS (SELECT 1 FROM dbo.nutrients WHERE code = 'creatine')
    INSERT INTO dbo.nutrients (id, code, name, category, unit, daily_value, display_order, is_active)
    VALUES (NEWID(), 'creatine', 'Creatine', 'other', 'g', NULL, 85, 1);
ELSE
    UPDATE dbo.nutrients SET category = 'other', display_order = 85 WHERE code = 'creatine';

/* 4. Water — add if missing. Tracked in mL; no daily target. */
IF NOT EXISTS (SELECT 1 FROM dbo.nutrients WHERE code = 'water')
    INSERT INTO dbo.nutrients (id, code, name, category, unit, daily_value, display_order, is_active)
    VALUES (NEWID(), 'water', 'Water', 'other', 'mL', NULL, 90, 1);

/* 5. Re-add the constraint with the canonical three categories. */
ALTER TABLE dbo.nutrients
    ADD CONSTRAINT chk_nutrients_category
    CHECK (category IN ('other', 'mineral', 'vitamin'));

/* 6. Keep creatine wired onto the "Creatine Monohydrate" food (5 g/serving). */
DECLARE @creatine_id uniqueidentifier = (SELECT id FROM dbo.nutrients WHERE code = 'creatine');
DECLARE @food_id uniqueidentifier = '15DB31F9-13A2-40DB-BC81-24A113F868D0';

IF @creatine_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM dbo.foods WHERE id = @food_id)
   AND NOT EXISTS (SELECT 1 FROM dbo.food_nutrients WHERE food_id = @food_id AND nutrient_id = @creatine_id)
    INSERT INTO dbo.food_nutrients (food_id, nutrient_id, amount)
    VALUES (@food_id, @creatine_id, 5);

COMMIT;
