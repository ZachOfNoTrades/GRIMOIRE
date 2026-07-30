import { estimateGenericFood } from './genericFoodLLM';
import { createFood, listFoods } from './foodFunctions';
import { listNutrients } from './nutrientFunctions';
import { lookupGenericFoodFromFdc } from './usdaFdc';
import type { FdcPortion } from './usdaFdc';
import { ensureServingForUnit } from './unitConversion';
import { Food } from '../types/food';

// One scraped/identified ingredient line, normalized to a generic food name +
// a quantity in some unit. Produced by recipe-photo (image) or recipeUrlLLM (web).
//
// Two flavors:
//   - photo: unit "serving", quantity = number of canonical servings, no grams.
//   - web:   unit = the recipe's real measure (tbsp, clove, cup, g…), quantity in
//            that unit, plus `grams` = the same amount expressed in grams, used as
//            a universal fallback when the food doesn't carry the recipe's unit.
export interface IngredientItem {
  name: string;
  quantity: number;
  unit: string;
  grams?: number;
}

// An IngredientItem resolved to a real library Food + the serving it maps to.
// This is the shape both recipe-photo and recipe-url hand back to their callers.
export interface ResolvedIngredient {
  food: Food;
  serving_id: string | null;
  quantity: number;
  serving_unit: string;
}

// Resolve a batch of ingredient items into library foods. For each item:
//   1. Reuse an existing generic/usda food whose name matches (token-set), so
//      repeated imports don't spawn duplicates.
//   2. Else look it up in USDA FoodData Central (authoritative nutrition).
//   3. Else ask the LLM for USDA-average nutrition.
// Then ensure the food carries the recipe's own unit (adding a UOM if needed via
// the deterministic conversion engine), and map the item onto it.
//
// The result is ALIGNED to the input: result[i] is the resolution of items[i],
// or null if that item could not be resolved. Callers that only want successes
// can `.filter(Boolean)`; callers that want to keep failures as placeholders
// can map index-wise (the resolver renames items, so name-matching the result
// back to the input is unreliable — use the index).
//
// Shared by api/recipe-photo (image) and api/recipes/import-url (web) so the
// name -> food resolution lives in exactly one place.
export async function resolveIngredientItems(
  userId: string,
  items: IngredientItem[]
): Promise<(ResolvedIngredient | null)[]> {
  if (items.length === 0) return [];

  const allNutrients = await listNutrients();
  const codeToId = new Map(allNutrients.map((n) => [n.code, n.id]));

  const results = await Promise.all(
    items.map(async (item): Promise<ResolvedIngredient | null> => {
      try {
        // 1. Reuse an existing local food.
        let food: Food | null = await findLocalFood(userId, item.name);
        let portions: FdcPortion[] | undefined;

        // 2/3. Create from FDC, falling back to the LLM.
        if (!food) {
          const fdc = await lookupGenericFoodFromFdc(item.name);
          const estimate = fdc ?? (await estimateGenericFood(item.name));
          const nutrients = Object.entries(estimate.nutrients)
            .filter(([code, amt]) => amt > 0 && codeToId.has(code))
            .map(([code, amt]) => ({ nutrient_id: codeToId.get(code)!, amount: amt }));

          food = await createFood(userId, {
            name: estimate.name,
            brand: null,
            source: fdc ? 'usda' : 'generic',
            usda_fdc_id: fdc ? fdc.usda_fdc_id : null,
            kcal_per_serving: estimate.kcal,
            protein_g_per_serving: estimate.protein_g,
            carbs_g_per_serving: estimate.carbs_g,
            fat_g_per_serving: estimate.fat_g,
            icon: null,
            barcode_upc: null,
            servings: [
              { unit: estimate.serving_unit, units_per_serving: 1 },
              { unit: 'g', units_per_serving: estimate.serving_grams },
            ],
            nutrients,
          });
          if (fdc) portions = fdc.portions;
        }

        // Teach the food the recipe's unit (adds a UOM row if missing), then map.
        const placed = await ensureServingForUnit(userId, food, item.unit, item.quantity, {
          grams: item.grams,
          portions,
        });
        return {
          food,
          serving_id: placed.serving_id,
          quantity: placed.quantity,
          serving_unit: placed.serving_unit,
        };
      } catch (err) {
        console.error(`[recipe-resolver] Failed to resolve "${item.name}":`, err);
        return null;
      }
    })
  );

  return results;
}

// Tokenize a food name into a lowercase set of word tokens, dropping punctuation.
// "Wine, White" and "white wine" both -> {white, wine}, so recipe phrasing finds
// inverted FDC-style names.
function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Find an existing generic/usda food matching `name` by exact token-set equality.
// Subset/ambiguous matches (e.g. "rice" vs "white rice") are deliberately NOT
// reused — they fall through to an FDC lookup instead, accepting an occasional
// near-duplicate food over a wrong reuse.
async function findLocalFood(userId: string, name: string): Promise<Food | null> {
  const qTokens = tokenize(name);
  if (qTokens.length === 0) return null;

  // Narrow candidates with a cheap LIKE on the first token, then match in JS.
  const candidates = await listFoods(userId, qTokens[0]);
  const qSet = new Set(qTokens);
  for (const f of candidates) {
    if (f.source !== 'generic' && f.source !== 'usda') continue;
    const fSet = new Set(tokenize(f.name));
    if (fSet.size === qSet.size && [...qSet].every((t) => fSet.has(t))) {
      return f;
    }
  }
  return null;
}
