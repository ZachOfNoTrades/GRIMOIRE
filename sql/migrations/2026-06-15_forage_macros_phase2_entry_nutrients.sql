-- =====================================================================
-- Forage macros→nutrients, Phase 2: entry-level nutrient store
-- =====================================================================
-- Foodless "quick add" entries carry their macros in food_entries.quick_add_*
-- columns (there is no food row to hang food_nutrients off). To migrate macros
-- fully into the nutrient model with NO DATA LOSS, add an entry-level EAV
-- (food_entry_nutrients) mirroring food_nutrients, and copy every quick-add
-- entry's macros into it. `amount` is per-unit (per quantity = 1), scaled by
-- food_entries.quantity at read — exactly how quick_add_* is read today.
--
-- The quick_add_* columns are NOT dropped here (Phase 5 drops them once reads
-- are flipped + verified). Idempotent + reversible.
-- =====================================================================

SET XACT_ABORT ON;
BEGIN TRAN;

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='food_entry_nutrients' AND xtype='U')
BEGIN
    CREATE TABLE food_entry_nutrients (
        entry_id    UNIQUEIDENTIFIER NOT NULL,
        nutrient_id UNIQUEIDENTIFIER NOT NULL,
        amount      DECIMAL(12,4)    NOT NULL,  -- per-unit (quantity=1); scaled by food_entries.quantity at read
        CONSTRAINT PK_food_entry_nutrients PRIMARY KEY (entry_id, nutrient_id),
        CONSTRAINT FK_food_entry_nutrients_entry FOREIGN KEY (entry_id) REFERENCES food_entries(id) ON DELETE CASCADE,
        CONSTRAINT FK_food_entry_nutrients_nutrient FOREIGN KEY (nutrient_id) REFERENCES nutrients(id)
    );
    CREATE INDEX IX_food_entry_nutrients_nutrient ON food_entry_nutrients (nutrient_id);
END

-- Migrate quick-add macros (per-unit values) into the entry EAV. Only > 0
-- amounts get a row (absent = 0), matching the food_nutrients convention.
;WITH qa(entry_id, code, amount) AS (
    SELECT id, 'kcal',    quick_add_kcal      FROM food_entries WHERE food_id IS NULL AND quick_add_kcal      > 0
    UNION ALL SELECT id, 'protein', quick_add_protein_g FROM food_entries WHERE food_id IS NULL AND quick_add_protein_g > 0
    UNION ALL SELECT id, 'fat',     quick_add_fat_g     FROM food_entries WHERE food_id IS NULL AND quick_add_fat_g     > 0
    UNION ALL SELECT id, 'carbs',   quick_add_carbs_g   FROM food_entries WHERE food_id IS NULL AND quick_add_carbs_g   > 0
)
MERGE food_entry_nutrients AS tgt
USING (
    SELECT qa.entry_id, n.id AS nutrient_id, CAST(qa.amount AS DECIMAL(12,4)) AS amount
    FROM qa JOIN nutrients n ON n.code = qa.code
) AS src
ON tgt.entry_id = src.entry_id AND tgt.nutrient_id = src.nutrient_id
WHEN MATCHED THEN UPDATE SET amount = src.amount
WHEN NOT MATCHED THEN INSERT (entry_id, nutrient_id, amount)
    VALUES (src.entry_id, src.nutrient_id, src.amount);

COMMIT TRAN;

-- Report: rows migrated vs. foodless entries with macros (should reconcile).
SELECT n.code, COUNT(*) AS rows
FROM food_entry_nutrients fen JOIN nutrients n ON n.id = fen.nutrient_id
GROUP BY n.code ORDER BY n.code;
SELECT COUNT(*) AS foodless_entries_with_macros
FROM food_entries WHERE food_id IS NULL
  AND (quick_add_kcal > 0 OR quick_add_protein_g > 0 OR quick_add_carbs_g > 0 OR quick_add_fat_g > 0);
