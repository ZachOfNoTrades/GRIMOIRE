import { Food, FoodNutrient } from './food';

// A recipe ingredient is one of two shapes — RESOLVED (links a real food + qty/unit
// in the library) or PLACEHOLDER (free-text from a URL/AI import, awaiting the
// user clicking "Replace" to pick the actual library food it should map to).
// Placeholder rows contribute 0 to the recipe's computed macros until resolved.
export interface RecipeIngredient {
  id: string;
  display_order: number;
  // Resolved-path fields. Both null on placeholder rows.
  ingredient_food_id: string | null;
  serving_id: string | null;
  quantity: number;
  // Placeholder-path fields. Both null on resolved rows.
  placeholder_name: string | null;
  placeholder_quantity_text: string | null;
  // Display-only, hydrated by the lib layer on read. Lets the UI render the
  // row without a second round-trip to the foods table.
  food_name?: string | null;
  food_brand?: string | null;
  food_icon?: string | null;
  // Mirrors foods.image_updated_at so an ingredient row can render the food's
  // stored product photo (icon only as the fallback) without a second fetch.
  food_image_updated_at?: string | null;
  serving_unit?: string | null;
  units_per_serving?: number | null;
  // Per-row macro contribution at this quantity. Zero on unresolved placeholders.
  kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  // Hydrated per-nutrient contribution for this row. Zero on placeholders.
  nutrients?: FoodNutrient[];
  // All available servings for this ingredient's food (for UOM switching).
  food_servings?: import('./food').FoodServing[];
}

// A recipe wraps a `foods` row (source='recipe') and decorates it with the
// recipe-only fields and its ingredient list. `Food` already carries the
// computed per-serving macros + icon + canonical 'serving' food_servings row,
// so listing recipes in pickers (alongside foods) doesn't need a special path.
//
// `serving_count` is the recipe's yield (how many servings it makes). Named
// distinctly from `Food.servings` (the FoodServing[] array) to avoid collision.
export interface Recipe extends Food {
  serving_count: number;
  ingredients: RecipeIngredient[];
  // Sort keys for the recipe lists (sorted client-side). `ts_created` is when the
  // recipe was built; `ts_updated` is when it was last edited (bumped by every
  // recipe write); `last_used` is the most recent time it was logged
  // (MAX food_entries.ts_logged), null if never logged. All hydrated by listRecipes.
  ts_created?: string | null;
  ts_updated?: string | null;
  last_used?: string | null;
}

// A `Food` payload that also carries its recipe ingredient list. This is what
// GET /modules/forage/api/foods/[id] returns for source='recipe' foods, so the
// food detail view gets ingredients preloaded with the food rather than fetching
// them separately. Absent on every other food source.
export type FoodWithIngredients = Food & { ingredients?: RecipeIngredient[] };

// Wire shape for create/update. Ingredients are submitted in display order;
// each row is either resolved (food_id + qty + serving_id) OR a placeholder
// (placeholder_name set). The lib layer enforces the chk constraint.
export interface RecipeIngredientInput {
  ingredient_food_id?: string | null;
  serving_id?: string | null;
  quantity?: number;
  placeholder_name?: string | null;
  placeholder_quantity_text?: string | null;
}

export interface CreateRecipeInput {
  name: string;
  serving_count: number;
  icon?: string | null;
  ingredients: RecipeIngredientInput[];
}
