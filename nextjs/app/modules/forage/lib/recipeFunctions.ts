import sql from 'mssql';
import { getFoodConnection, closeFoodConnection } from './db';
import { escapeLike } from './foodFunctions';
import { Recipe, RecipeIngredient, RecipeIngredientInput, CreateRecipeInput } from '../types/recipe';
import { FoodNutrient, FoodServing } from '../types/food';

// A recipe is stored as TWO rows working in concert:
//   * `foods` row, source='recipe' — carries the display name + icon + computed
//     per-serving macros so the recipe is indistinguishable from a normal food
//     in pickers, the diary log, and (recursively) other recipes' ingredient lists.
//   * `forage_recipes` row — the recipe-only fields (yield, optional cooked weight).
// Plus N rows in `forage_recipe_ingredients`. On create/update we recompute the
// foods row's macros from the resolved ingredient rows (placeholders contribute 0).

// ============================================================================
// Macro computation
// ============================================================================

// Resolve "quantity in <serving_id.unit>" to a serving-count multiplier for the
// ingredient food. food_servings.units_per_serving = how many of <unit> equal 1
// canonical serving — so serving_count = quantity / units_per_serving.
function servingCountFor(
  quantity: number,
  unitsPerServing: number | null | undefined
): number {
  if (!unitsPerServing || unitsPerServing <= 0) return 0;
  return quantity / unitsPerServing;
}

interface ComputedMacros {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  nutrients: FoodNutrient[];
}

// Sum every resolved ingredient's contribution (macros + per-nutrient amount).
// Placeholder rows contribute 0 to every total. Returns RECIPE totals (not yet
// divided by yield_servings) so callers can choose per-serving vs per-recipe.
function sumRecipeMacros(ingredients: RecipeIngredient[]): ComputedMacros {
  let kcal = 0, protein_g = 0, carbs_g = 0, fat_g = 0;
  const nutrientTotals = new Map<string, number>();
  for (const row of ingredients) {
    if (!row.ingredient_food_id) continue; // placeholder rows contribute 0
    // hydrateIngredients already scaled per-row macros + per-nutrient amount
    // by serving count, so just sum them.
    kcal += (row.kcal ?? 0);
    protein_g += (row.protein_g ?? 0);
    carbs_g += (row.carbs_g ?? 0);
    fat_g += (row.fat_g ?? 0);
    for (const n of row.nutrients ?? []) {
      nutrientTotals.set(n.nutrient_id, (nutrientTotals.get(n.nutrient_id) ?? 0) + n.amount);
    }
  }
  return {
    kcal,
    protein_g,
    carbs_g,
    fat_g,
    nutrients: Array.from(nutrientTotals, ([nutrient_id, amount]) => ({ nutrient_id, amount })),
  };
}

// ============================================================================
// Read paths
// ============================================================================

// Hydrate the per-row macro contribution + display fields by joining
// ingredient_food_id to its foods + food_servings + food_nutrients rows.
// One round trip per recipe is fine here — recipes have O(10) ingredients.
async function hydrateIngredients(
  pool: sql.ConnectionPool,
  recipeFoodId: string
): Promise<RecipeIngredient[]> {
  const rows = await pool
    .request()
    .input('recipeId', sql.UniqueIdentifier, recipeFoodId)
    .query<any>(`
      SELECT
        ri.id, ri.display_order, ri.ingredient_food_id, ri.serving_id, ri.quantity,
        ri.placeholder_name, ri.placeholder_quantity_text,
        f.name AS food_name, f.brand AS food_brand, f.icon AS food_icon,
        fs.unit AS serving_unit, fs.units_per_serving
      FROM forage_recipe_ingredients ri
      LEFT JOIN foods f ON f.id = ri.ingredient_food_id
      LEFT JOIN food_servings fs ON fs.id = ri.serving_id
      WHERE ri.recipe_food_id = @recipeId
      ORDER BY ri.display_order ASC, ri.ts_created ASC
    `);

  // Bulk-fetch nutrients for all resolved ingredient foods (one query). Macros
  // (category='macro') are ordinary nutrient rows now, so an ingredient's
  // per-serving macros are read from food_nutrients here — no foods.*_per_serving
  // columns. `code` lets us pull the macros back out for the per-ingredient
  // kcal/protein_g/carbs_g/fat_g fields the rollup expects.
  const foodIds = Array.from(new Set(
    rows.recordset.map((r) => r.ingredient_food_id).filter(Boolean)
  ));
  const nutrientsByFood = new Map<string, FoodNutrient[]>();
  const macrosByFood = new Map<string, Record<string, number>>(); // food_id → { code: per-serving amount }
  if (foodIds.length > 0) {
    const ids = foodIds.map((id) => `'${id}'`).join(',');
    const nutRes = await pool.request().query<{ food_id: string; nutrient_id: string; code: string; category: string; amount: number }>(
      `SELECT fn.food_id, fn.nutrient_id, n.code, n.category, fn.amount
       FROM food_nutrients fn JOIN nutrients n ON n.id = fn.nutrient_id
       WHERE fn.food_id IN (${ids})`
    );
    for (const n of nutRes.recordset) {
      if (!nutrientsByFood.has(n.food_id)) nutrientsByFood.set(n.food_id, []);
      nutrientsByFood.get(n.food_id)!.push({ nutrient_id: n.nutrient_id, amount: Number(n.amount) });
      if (n.category === 'macro') {
        if (!macrosByFood.has(n.food_id)) macrosByFood.set(n.food_id, {});
        macrosByFood.get(n.food_id)![n.code] = Number(n.amount);
      }
    }
  }

  // Bulk-fetch all available servings for each ingredient food (for UOM switching).
  const servingsByFood = new Map<string, FoodServing[]>();
  if (foodIds.length > 0) {
    const ids = foodIds.map((id) => `'${id}'`).join(',');
    const srvRes = await pool.request().query<FoodServing>(
      `SELECT id, food_id, unit, units_per_serving FROM food_servings
       WHERE food_id IN (${ids})
       ORDER BY CASE WHEN unit='serving' THEN 0 ELSE 1 END, unit ASC`
    );
    for (const s of srvRes.recordset) {
      if (!servingsByFood.has(s.food_id)) servingsByFood.set(s.food_id, []);
      servingsByFood.get(s.food_id)!.push({ ...s, units_per_serving: Number(s.units_per_serving) });
    }
  }

  return rows.recordset.map((r) => {
    const quantity = Number(r.quantity);
    const unitsPerServing = r.units_per_serving == null ? null : Number(r.units_per_serving);
    const servings = r.ingredient_food_id ? servingCountFor(quantity, unitsPerServing) : 0;
    const foodNutrients = r.ingredient_food_id ? (nutrientsByFood.get(r.ingredient_food_id) ?? []) : [];
    const m = r.ingredient_food_id ? (macrosByFood.get(r.ingredient_food_id) ?? {}) : {};
    return {
      id: r.id,
      display_order: r.display_order,
      ingredient_food_id: r.ingredient_food_id,
      serving_id: r.serving_id,
      quantity,
      placeholder_name: r.placeholder_name,
      placeholder_quantity_text: r.placeholder_quantity_text,
      food_name: r.food_name,
      food_brand: r.food_brand,
      food_icon: r.food_icon,
      serving_unit: r.serving_unit,
      units_per_serving: unitsPerServing,
      kcal: servings * (m['kcal'] ?? 0),
      protein_g: servings * (m['protein'] ?? 0),
      carbs_g: servings * (m['carbs'] ?? 0),
      fat_g: servings * (m['fat'] ?? 0),
      nutrients: foodNutrients.map((n) => ({ nutrient_id: n.nutrient_id, amount: servings * n.amount })),
      food_servings: r.ingredient_food_id ? (servingsByFood.get(r.ingredient_food_id) ?? []) : [],
    };
  });
}

// Macro per-serving values for a recipe's `foods` row, derived from the nutrient
// EAV (category='macro') rather than the legacy foods.*_per_serving columns.
// `f` is the foods alias in the recipe queries below.
const FOOD_MACRO_JOIN = `LEFT JOIN (
        SELECT fn.food_id,
               MAX(CASE WHEN n.code='kcal'    THEN fn.amount END) AS kcal_per_serving,
               MAX(CASE WHEN n.code='protein' THEN fn.amount END) AS protein_g_per_serving,
               MAX(CASE WHEN n.code='carbs'   THEN fn.amount END) AS carbs_g_per_serving,
               MAX(CASE WHEN n.code='fat'     THEN fn.amount END) AS fat_g_per_serving
        FROM food_nutrients fn JOIN nutrients n ON n.id = fn.nutrient_id AND n.category = 'macro'
        GROUP BY fn.food_id
      ) macro ON macro.food_id = f.id`;
const FOOD_MACRO_SELECT = `ISNULL(macro.kcal_per_serving,0) AS kcal_per_serving,
        ISNULL(macro.protein_g_per_serving,0) AS protein_g_per_serving,
        ISNULL(macro.carbs_g_per_serving,0) AS carbs_g_per_serving,
        ISNULL(macro.fat_g_per_serving,0) AS fat_g_per_serving`;

// Sort options for the diary picker's Recipes tab. 'last_used' ranks by the most
// recent time the recipe was logged (food_entries.ts_logged), 'created' by when
// the recipe was first built (foods.ts_created), 'name' alphabetically (A→Z).
export type RecipeSort = 'last_used' | 'created' | 'name';

export async function listRecipes(
  userId: string,
  search: string | null,
  sort: RecipeSort = 'last_used',
): Promise<Recipe[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const req = pool.request().input('userId', sql.UniqueIdentifier, userId);
    let where = `f.user_id = @userId AND f.is_archived = 0 AND f.source = 'recipe'`;
    if (search) {
      // Token-based search, identical to listFoods: trim the query, split it on
      // whitespace and require EVERY token to appear in the name. Trimming matters
      // because the logger's search box is shared between the Search and Recipes
      // tabs, and a mobile keyboard readily appends a trailing space — a raw
      // `LIKE '%shake %'` then matched nothing while the foods tab still found
      // "Shake". Tokens also let "protein shake" match "Shake, protein".
      const tokens = search.trim().split(/\s+/).filter(Boolean);
      tokens.forEach((token, index) => {
        const param = `q${index}`;
        req.input(param, sql.NVarChar(255), `%${escapeLike(token)}%`);
        where += ` AND f.name LIKE @${param} ESCAPE '\\'`;
      });
    }
    // Always join each recipe's most-recent log time (MAX ts_logged over this
    // user's entries) so every row carries `last_used` — the picker sorts the
    // whole list client-side, so it needs the sort keys hydrated on every recipe
    // (recipes never logged have NULL, which the client treats as oldest).
    const lastUsedJoin = `LEFT JOIN (
      SELECT food_id, MAX(ts_logged) AS last_used
      FROM food_entries
      WHERE user_id = @userId
      GROUP BY food_id
    ) lu ON lu.food_id = f.id`;
    // The `sort` param still drives the server-side ORDER BY. The picker sorts
    // client-side today (all recipes fit in one TOP 200 payload), but keeping the
    // param means a future paginated recipes list can order at the DB instead.
    const orderBy = sort === 'name'
      ? 'f.name ASC'
      : sort === 'created'
        ? 'f.ts_created DESC, f.name ASC'
        : 'lu.last_used DESC, f.name ASC';
    const result = await req.query<any>(`
      SELECT TOP 200
        f.id, f.user_id, f.name, f.brand, f.source, f.usda_fdc_id, f.barcode_upc,
        ${FOOD_MACRO_SELECT},
        f.is_favorite, f.is_archived, f.icon, f.ts_created, lu.last_used,
        r.servings AS serving_count
      FROM foods f
      INNER JOIN forage_recipes r ON r.food_id = f.id
      ${FOOD_MACRO_JOIN}
      ${lastUsedJoin}
      WHERE ${where}
      ORDER BY ${orderBy}
    `);
    if (result.recordset.length === 0) {
      console.warn(`No recipes found for user_id: '${userId}'`);
      return [];
    }
    // Hydrate each recipe's food_servings rows (every recipe has a canonical
    // 'serving' row — see ensureCanonicalServing) so the diary picker renders a
    // real unit ('serving') and food_entries.serving_id resolves on log. List
    // view still skips ingredient detail to keep it cheap.
    const recipeIds = result.recordset.map((r) => r.id as string);
    const servingsReq = pool.request();
    const idParams = recipeIds.map((id, i) => {
      const name = `s${i}`;
      servingsReq.input(name, sql.UniqueIdentifier, id);
      return `@${name}`;
    });
    const servingsResult = await servingsReq.query<{ id: string; food_id: string; unit: string; units_per_serving: number }>(
      `SELECT id, food_id, unit, units_per_serving FROM food_servings
       WHERE food_id IN (${idParams.join(',')})
       ORDER BY CASE WHEN unit='serving' THEN 0 ELSE 1 END, unit ASC`
    );
    const servingsByRecipe = new Map<string, { id: string; food_id: string; unit: string; units_per_serving: number }[]>();
    for (const s of servingsResult.recordset) {
      if (!servingsByRecipe.has(s.food_id)) servingsByRecipe.set(s.food_id, []);
      servingsByRecipe.get(s.food_id)!.push({ ...s, units_per_serving: Number(s.units_per_serving) });
    }
    return result.recordset.map((r) => ({
      ...r,
      kcal_per_serving: Number(r.kcal_per_serving),
      protein_g_per_serving: Number(r.protein_g_per_serving),
      carbs_g_per_serving: Number(r.carbs_g_per_serving),
      fat_g_per_serving: Number(r.fat_g_per_serving),
      is_archived: !!r.is_archived,
      is_favorite: !!r.is_favorite,
      serving_count: Number(r.serving_count),
      servings: servingsByRecipe.get(r.id) ?? [],
      ingredients: [],
    }));
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Lightweight "Where used" lookup: given an ingredient food, find the user's
// recipes that include it (via forage_recipe_ingredients). Returns just enough
// to render a clickable list (recipe food id + name/brand/icon). Scoped to the
// user's own, non-archived recipes — recipes are always user-owned foods.
export async function listRecipesUsingFood(
  userId: string,
  ingredientFoodId: string
): Promise<{ id: string; name: string; brand: string | null; icon: string | null }[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('ingredientFoodId', sql.UniqueIdentifier, ingredientFoodId)
      .query<{ id: string; name: string; brand: string | null; icon: string | null }>(`
        SELECT DISTINCT f.id, f.name, f.brand, f.icon
        FROM forage_recipe_ingredients ri
        INNER JOIN foods f ON f.id = ri.recipe_food_id
        WHERE ri.ingredient_food_id = @ingredientFoodId
          AND f.user_id = @userId
          AND f.is_archived = 0
          AND f.source = 'recipe'
        ORDER BY f.name ASC
      `);
    if (result.recordset.length === 0) {
      console.warn(`No recipes use ingredient food_id: '${ingredientFoodId}'`);
    }
    return result.recordset;
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function getRecipe(userId: string, recipeFoodId: string): Promise<Recipe> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('id', sql.UniqueIdentifier, recipeFoodId)
      .input('userId', sql.UniqueIdentifier, userId)
      .query<any>(`
        SELECT
          f.id, f.user_id, f.name, f.brand, f.source, f.usda_fdc_id, f.barcode_upc,
          ${FOOD_MACRO_SELECT},
          f.is_favorite, f.is_archived, f.icon,
          r.servings AS serving_count
        FROM foods f
        INNER JOIN forage_recipes r ON r.food_id = f.id
        ${FOOD_MACRO_JOIN}
        WHERE f.id = @id AND f.user_id = @userId AND f.source = 'recipe'
      `);
    if (result.recordset.length === 0) {
      throw new Error(`No recipe found for id: '${recipeFoodId}'`);
    }
    const ingredients = await hydrateIngredients(pool, recipeFoodId);
    const r = result.recordset[0];
    return {
      ...r,
      kcal_per_serving: Number(r.kcal_per_serving),
      protein_g_per_serving: Number(r.protein_g_per_serving),
      carbs_g_per_serving: Number(r.carbs_g_per_serving),
      fat_g_per_serving: Number(r.fat_g_per_serving),
      is_archived: !!r.is_archived,
      is_favorite: !!r.is_favorite,
      serving_count: Number(r.serving_count),
      servings: [], // recipe always has canonical 'serving' row but pickers don't need it here
      ingredients,
    };
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Ingredient list for one recipe, scoped to the owning user. Lets the food
// detail read path ship a recipe's ingredients in the same payload as the rest
// of the food, so the detail view paints them in one pass instead of a second
// client round trip. A non-recipe / not-owned id yields an empty list rather
// than an error — this is a multi-record read, and the caller (a food that may
// or may not be a recipe) treats "no ingredients" as simply nothing to render.
export async function getRecipeIngredients(
  userId: string,
  recipeFoodId: string
): Promise<RecipeIngredient[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const recipeRow = await pool
      .request()
      .input('id', sql.UniqueIdentifier, recipeFoodId)
      .input('userId', sql.UniqueIdentifier, userId)
      .query<{ id: string }>(`
        SELECT f.id
        FROM foods f
        INNER JOIN forage_recipes r ON r.food_id = f.id
        WHERE f.id = @id AND f.user_id = @userId AND f.source = 'recipe'
      `);
    if (recipeRow.recordset.length === 0) {
      console.warn(`No recipe found for food id: '${recipeFoodId}'`);
      return [];
    }
    const ingredients = await hydrateIngredients(pool, recipeFoodId);
    if (ingredients.length === 0) {
      console.warn(`No ingredients found for recipe food id: '${recipeFoodId}'`);
    }
    return ingredients;
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// ============================================================================
// Write paths
// ============================================================================

// Normalize incoming ingredient rows: assign display_order from array index,
// resolve to the two valid shapes (resolved | placeholder), drop garbage rows.
function normalizeIngredients(input: RecipeIngredientInput[] | undefined): RecipeIngredientInput[] {
  if (!Array.isArray(input)) return [];
  const out: RecipeIngredientInput[] = [];
  for (const row of input) {
    if (!row) continue;
    const foodId = typeof row.ingredient_food_id === 'string' && row.ingredient_food_id ? row.ingredient_food_id : null;
    const placeholderName = typeof row.placeholder_name === 'string' && row.placeholder_name.trim()
      ? row.placeholder_name.trim()
      : null;
    if (!foodId && !placeholderName) continue; // chk-constraint violator
    out.push({
      ingredient_food_id: foodId,
      serving_id: typeof row.serving_id === 'string' && row.serving_id ? row.serving_id : null,
      quantity: Number.isFinite(Number(row.quantity)) && Number(row.quantity) > 0 ? Number(row.quantity) : 1,
      placeholder_name: foodId ? null : placeholderName,
      placeholder_quantity_text: typeof row.placeholder_quantity_text === 'string' && row.placeholder_quantity_text.trim()
        ? row.placeholder_quantity_text.trim()
        : null,
    });
  }
  return out;
}

// Recompute the foods row from the freshly-hydrated ingredient list — the
// per-serving figures stored on `foods` are what the diary picker and any
// recipe-using-recipe will read, so they must always reflect current state.
async function refreshRecipeFoodRow(
  pool: sql.ConnectionPool,
  recipeFoodId: string
): Promise<void> {
  const ingredients = await hydrateIngredients(pool, recipeFoodId);
  const recipeMeta = await pool
    .request()
    .input('id', sql.UniqueIdentifier, recipeFoodId)
    .query<{ servings: number }>(
      `SELECT servings FROM forage_recipes WHERE food_id = @id`
    );
  const servingCount = Math.max(0.001, Number(recipeMeta.recordset[0]?.servings ?? 1));
  const totals = sumRecipeMacros(ingredients);
  // Touch ts_updated so the recipe sorts as recently-changed. The recipe's
  // per-serving macros are NOT stored as columns anymore — they live in
  // food_nutrients (category='macro'), recomputed via the reconcile below.
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, recipeFoodId)
    .query(`UPDATE foods SET ts_updated = GETDATE() WHERE id = @id`);
  // Recompute per-serving nutrient EAV (macros + micros). Same reconcile pattern
  // as foods. Macros flow through totals.nutrients (each ingredient's
  // food_nutrients carries its macro rows), so they're reconciled here too.
  const perServingNutrients = totals.nutrients.map((n) => ({
    nutrient_id: n.nutrient_id,
    amount: n.amount / servingCount,
  }));
  // Macros (category='macro') already flow through perServingNutrients: each
  // ingredient's food_nutrients now carries its macro rows, so sumRecipeMacros
  // accumulates them into totals.nutrients alongside the micros. No separate
  // macro append is needed (doing so would double-insert the macro nutrient_ids).
  await reconcileRecipeNutrients(pool, recipeFoodId, perServingNutrients);
}

async function reconcileRecipeNutrients(
  pool: sql.ConnectionPool,
  foodId: string,
  nutrients: FoodNutrient[]
): Promise<void> {
  const existing = await pool
    .request()
    .input('foodId', sql.UniqueIdentifier, foodId)
    .query<{ nutrient_id: string }>(`SELECT nutrient_id FROM food_nutrients WHERE food_id = @foodId`);
  const existingIds = new Set(existing.recordset.map((r) => r.nutrient_id));
  const keep = new Set(nutrients.map((n) => n.nutrient_id));
  for (const n of nutrients) {
    if (existingIds.has(n.nutrient_id)) {
      await pool
        .request()
        .input('foodId', sql.UniqueIdentifier, foodId)
        .input('nutrientId', sql.UniqueIdentifier, n.nutrient_id)
        .input('amount', sql.Decimal(12, 4), n.amount)
        .query(`UPDATE food_nutrients SET amount=@amount WHERE food_id=@foodId AND nutrient_id=@nutrientId`);
    } else {
      await pool
        .request()
        .input('foodId', sql.UniqueIdentifier, foodId)
        .input('nutrientId', sql.UniqueIdentifier, n.nutrient_id)
        .input('amount', sql.Decimal(12, 4), n.amount)
        .query(`INSERT INTO food_nutrients (food_id, nutrient_id, amount) VALUES (@foodId, @nutrientId, @amount)`);
    }
  }
  for (const id of existingIds) {
    if (!keep.has(id)) {
      await pool
        .request()
        .input('foodId', sql.UniqueIdentifier, foodId)
        .input('nutrientId', sql.UniqueIdentifier, id)
        .query(`DELETE FROM food_nutrients WHERE food_id=@foodId AND nutrient_id=@nutrientId`);
    }
  }
}

// Replace the entire ingredient list. Cheaper than a row-by-row reconcile and
// fine here because ingredient rows aren't referenced by anything (unlike
// food_servings, which is FK-pointed-at by food_entries).
async function replaceIngredients(
  pool: sql.ConnectionPool,
  recipeFoodId: string,
  ingredients: RecipeIngredientInput[]
): Promise<void> {
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, recipeFoodId)
    .query(`DELETE FROM forage_recipe_ingredients WHERE recipe_food_id = @id`);
  for (let i = 0; i < ingredients.length; i++) {
    const row = ingredients[i];
    await pool
      .request()
      .input('recipeId', sql.UniqueIdentifier, recipeFoodId)
      .input('order', sql.Int, i)
      .input('foodId', sql.UniqueIdentifier, row.ingredient_food_id)
      .input('servingId', sql.UniqueIdentifier, row.serving_id)
      .input('quantity', sql.Decimal(10, 3), row.quantity ?? 1)
      .input('placeholderName', sql.NVarChar(255), row.placeholder_name)
      .input('placeholderQty', sql.NVarChar(64), row.placeholder_quantity_text)
      .query(`
        INSERT INTO forage_recipe_ingredients
          (recipe_food_id, display_order, ingredient_food_id, serving_id, quantity,
           placeholder_name, placeholder_quantity_text)
        VALUES (@recipeId, @order, @foodId, @servingId, @quantity, @placeholderName, @placeholderQty)
      `);
  }
}

// Ensure the recipe's foods row has a canonical 'serving' food_servings row.
// Without this, the diary picker can't render a unit dropdown for the recipe
// and `food_entries.serving_id` can't reference it.
async function ensureCanonicalServing(
  pool: sql.ConnectionPool,
  recipeFoodId: string
): Promise<void> {
  const existing = await pool
    .request()
    .input('foodId', sql.UniqueIdentifier, recipeFoodId)
    .query(`SELECT 1 FROM food_servings WHERE food_id = @foodId AND unit = 'serving'`);
  if (existing.recordset.length > 0) return;
  await pool
    .request()
    .input('foodId', sql.UniqueIdentifier, recipeFoodId)
    .query(`INSERT INTO food_servings (food_id, unit, units_per_serving) VALUES (@foodId, 'serving', 1)`);
}

export async function createRecipe(userId: string, input: CreateRecipeInput): Promise<Recipe> {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('Recipe name is required');
  const servingCount = Math.max(0.001, Number(input.serving_count ?? 1));
  let pool;
  try {
    pool = await getFoodConnection();
    // Insert the foods row first so its UUID can key forage_recipes + ingredient rows.
    const foodInsert = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('name', sql.NVarChar(255), name)
      .input('icon', sql.NVarChar(32), input.icon ?? null)
      // Macros are computed into food_nutrients by refreshRecipeFoodRow below,
      // not foods columns (dropped in the macro→nutrient migration).
      .query<{ id: string }>(`
        INSERT INTO foods (user_id, name, source, icon)
        OUTPUT INSERTED.id
        VALUES (@userId, @name, 'recipe', @icon)
      `);
    const recipeFoodId = foodInsert.recordset[0].id;
    await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, recipeFoodId)
      .input('servings', sql.Decimal(8, 3), servingCount)
      .query(`INSERT INTO forage_recipes (food_id, servings) VALUES (@foodId, @servings)`);
    await ensureCanonicalServing(pool, recipeFoodId);
    await replaceIngredients(pool, recipeFoodId, normalizeIngredients(input.ingredients));
    await refreshRecipeFoodRow(pool, recipeFoodId);
    return await getRecipe(userId, recipeFoodId);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function updateRecipe(
  userId: string,
  recipeFoodId: string,
  input: CreateRecipeInput
): Promise<Recipe> {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('Recipe name is required');
  const servingCount = Math.max(0.001, Number(input.serving_count ?? 1));
  let pool;
  try {
    pool = await getFoodConnection();
    const owned = await pool
      .request()
      .input('id', sql.UniqueIdentifier, recipeFoodId)
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`SELECT 1 FROM foods WHERE id=@id AND user_id=@userId AND source='recipe'`);
    if (owned.recordset.length === 0) {
      throw new Error(`No recipe found for id: '${recipeFoodId}'`);
    }
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, recipeFoodId)
      .input('name', sql.NVarChar(255), name)
      .input('icon', sql.NVarChar(32), input.icon ?? null)
      .query(`UPDATE foods SET name=@name, icon=@icon, ts_updated=GETDATE() WHERE id=@id`);
    await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, recipeFoodId)
      .input('servings', sql.Decimal(8, 3), servingCount)
      .query(`UPDATE forage_recipes SET servings=@servings,
              ts_updated=GETDATE() WHERE food_id=@foodId`);
    await ensureCanonicalServing(pool, recipeFoodId);
    await replaceIngredients(pool, recipeFoodId, normalizeIngredients(input.ingredients));
    await refreshRecipeFoodRow(pool, recipeFoodId);
    return await getRecipe(userId, recipeFoodId);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function archiveRecipe(userId: string, recipeFoodId: string): Promise<void> {
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, recipeFoodId)
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`UPDATE foods SET is_archived=1, ts_updated=GETDATE()
              WHERE id=@id AND user_id=@userId AND source='recipe'`);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}
