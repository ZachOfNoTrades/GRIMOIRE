/* ============================================================
   FORAGE — drop nutrients.display_order entirely.

   Nutrient render order is owned exclusively by the code manifest
   (forage/utils/nutrientLedger.ts → byNutrientOrder / NUTRIENT_CODES_IN_ORDER).
   The DB must NOT carry or dictate any ordering, so the column is removed.
   /api/nutrients now sorts by the manifest in JS (lib/nutrientFunctions.ts).

   NOTE: this only touches the `nutrients` table. Other display_order columns
   (food_units, forage_recipe_ingredients) are unrelated user-defined orderings
   and are intentionally left in place.

   Target DB: GRIMOIRE-FOOD-*  (run with that DB as current context).
   Idempotent: safe to re-run.
   ============================================================ */

SET XACT_ABORT ON;
BEGIN TRAN;

/* 1. Drop the (auto-named) DEFAULT constraint on display_order, if present. */
DECLARE @df SYSNAME = (
    SELECT dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.nutrients') AND c.name = 'display_order'
);
IF @df IS NOT NULL
    EXEC('ALTER TABLE dbo.nutrients DROP CONSTRAINT ' + @df);

/* 2. Drop the column itself, if it still exists. */
IF COL_LENGTH('dbo.nutrients', 'display_order') IS NOT NULL
    ALTER TABLE dbo.nutrients DROP COLUMN display_order;

COMMIT;
