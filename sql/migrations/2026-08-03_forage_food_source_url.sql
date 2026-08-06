-- 2026-08-03  GRIMOIRE-FOOD
-- Source link on foods: the public product/nutrition page a food's data came from.
-- Set by the create/edit food workflow (typed in, or stamped by "Import from website",
-- mirroring the recipe URL import) and used by the food detail page's "Resync" action,
-- which re-scrapes the page and refreshes the food's nutrition.
IF COL_LENGTH('dbo.foods', 'source_url') IS NULL
  ALTER TABLE dbo.foods ADD source_url NVARCHAR(1000) NULL;
