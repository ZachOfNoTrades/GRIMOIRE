-- Adds a per-user, configurable history window for the food picker's hourly
-- "favorites" suggestions (listHourlyFrequentFoodUsage). Default 30 days (~1 month)
-- so foods you logged at a given hour long ago stop counting as that hour's favorites.
-- Run against GRIMOIRE-FOOD-*.
SET QUOTED_IDENTIFIER ON;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('forage_user_settings') AND name = 'favorites_history_days'
)
BEGIN
    ALTER TABLE forage_user_settings
        ADD favorites_history_days INT NOT NULL
            CONSTRAINT df_forage_user_settings_fav_days DEFAULT 30
            CONSTRAINT chk_forage_user_settings_fav_days CHECK (favorites_history_days BETWEEN 1 AND 3650);
END
