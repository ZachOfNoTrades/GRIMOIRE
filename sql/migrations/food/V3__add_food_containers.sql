-- Add the containers a food is sold in, each holding a number of the food's servings
IF OBJECT_ID('dbo.food_containers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.food_containers (
        id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
        food_id UNIQUEIDENTIFIER NOT NULL,
        name NVARCHAR(64) NOT NULL, -- such as '16 oz jar'
        servings_per_container DECIMAL(10,3) NOT NULL, -- servings of the food in one full container
        display_order INT NOT NULL DEFAULT 0,
        ts_created DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_food_containers_food FOREIGN KEY (food_id) REFERENCES dbo.foods(id) ON DELETE CASCADE,
        CONSTRAINT CK_food_containers_servings CHECK (servings_per_container > 0)
    );

    CREATE INDEX IX_food_containers_food ON dbo.food_containers (food_id, display_order);
END
