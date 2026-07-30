-- Golem: add equipment.image_url so the equipment picker can show a small representative
-- photo per item instead of only the category icon. NULL is a valid, common state (falls
-- back to the category icon) — no DEFAULT needed. Run against the GOLEM database.
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'equipment' AND COLUMN_NAME = 'image_url'
)
BEGIN
    ALTER TABLE equipment
        ADD image_url NVARCHAR(500) NULL;
END
