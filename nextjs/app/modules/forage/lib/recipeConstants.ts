// Recipe field limits, mirrored from the schema: foods.name is NVARCHAR(255)
// and forage_recipes.servings is DECIMAL(8,3). Kept in their own module so
// client components can import them without pulling in the mssql-backed lib.
export const RECIPE_NAME_MAX = 255;
export const RECIPE_SERVINGS_MAX = 99999;
