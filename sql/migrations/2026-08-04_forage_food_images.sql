-- 2026-08-04  GRIMOIRE-FOOD
-- Product photos on foods, with the icon as the fallback.
--
-- Bytes are stored HERE rather than hotlinked from wherever the photo came from
-- (Open Food Facts today): a stored image survives that source being down or
-- re-revving its URLs, keeps the browser from announcing every food the user
-- looks at to a third party, and gets backed up with the rest of the database.
-- Images are small (OFF front photos are ~10-30 KB), so a blob column is a
-- better trade here than a filesystem mount to manage.
--
-- Split off the foods table so listing foods never drags blobs along.
IF OBJECT_ID('dbo.food_images', 'U') IS NULL
BEGIN
    CREATE TABLE food_images (
        food_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
        content_type NVARCHAR(64) NOT NULL,
        bytes VARBINARY(MAX) NOT NULL,
        byte_size INT NOT NULL,
        -- Where the photo was downloaded from, kept for provenance/re-fetch.
        source_url NVARCHAR(1000) NULL,
        ts_updated DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_food_images_food FOREIGN KEY (food_id) REFERENCES foods (id) ON DELETE CASCADE
    );
END;

-- Denormalized "has a photo" marker on the food itself, so list queries can
-- render avatars without joining the blob table. Doubles as the image URL's
-- cache-buster: the value changes whenever the photo is replaced.
IF COL_LENGTH('dbo.foods', 'image_updated_at') IS NULL
  ALTER TABLE dbo.foods ADD image_updated_at DATETIME2 NULL;
