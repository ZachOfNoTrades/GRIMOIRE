-- Golem: move equipment images from public/equipment/* files + image_url paths into the
-- database itself (image_data VARBINARY(MAX), always PNG), so the image lives alongside
-- the row instead of as a loose file the app has to keep in sync. Run against the GOLEM
-- database. Data population (reading files, writing image_data) is a separate one-off
-- script, not part of this migration; drop image_url only after that has run.
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'equipment' AND COLUMN_NAME = 'image_data'
)
BEGIN
    ALTER TABLE equipment
        ADD image_data VARBINARY(MAX) NULL;
END
-- Superseded by the fixed-PNG approach — every image is converted to PNG before load,
-- so a per-row content type is unnecessary.
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'equipment' AND COLUMN_NAME = 'image_content_type'
)
BEGIN
    ALTER TABLE equipment DROP COLUMN image_content_type;
END
-- image_data has been populated (see 2026-07-06_golem_equipment_image_blob_load.sql) —
-- drop the file-path column it replaces.
IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'equipment' AND COLUMN_NAME = 'image_url'
)
BEGIN
    ALTER TABLE equipment DROP COLUMN image_url;
END
