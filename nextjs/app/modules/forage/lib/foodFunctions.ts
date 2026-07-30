import sql from 'mssql';
import { getFoodConnection, closeFoodConnection } from './db';
import { Food, FoodNutrient, FoodServing, FoodNutrientRanking, FoodUsageStats } from '../types/food';

interface CreateFoodInput {
  name: string;
  brand?: string | null;
  source?: 'user' | 'generic' | 'usda';
  // Set when a food is copied from USDA FoodData Central (source 'usda').
  usda_fdc_id?: number | null;
  kcal_per_serving: number;
  protein_g_per_serving: number;
  carbs_g_per_serving: number;
  fat_g_per_serving: number;
  icon?: string | null;
  barcode_upc?: string | null;
  servings?: { unit: string; units_per_serving: number }[];
  nutrients?: FoodNutrient[];
  // When true, do NOT force the canonical {'serving', 1} row. Used for foods
  // whose reference basis is a base unit (per-100g / per-100ml), where a generic
  // "serving" unit is meaningless — the base unit (g/ml) is the reference.
  omit_default_serving?: boolean;
}

// Thrown by createFood when barcode_upc already belongs to an in-scope food (the
// user's own or a global, non-archived food). The API maps it to HTTP 409 so the
// UI can block the duplicate instead of silently creating a second copy.
export class DuplicateBarcodeError extends Error {
  constructor(public existingId: string, public existingName: string) {
    super(`A food with barcode already exists: '${existingName}'`);
    this.name = 'DuplicateBarcodeError';
  }
}

// Build the final list of servings to persist for a food. By default guarantees
// the canonical {'serving', 1} row exists so the food's natural unit is
// selectable. When omitDefault is set (per-100g / per-100ml foods, whose base
// unit IS the reference), the generic 'serving' row is neither required nor
// injected — only a real input list with no serving falls back to one.
function normalizeServings(
  input?: { unit: string; units_per_serving: number }[],
  omitDefault?: boolean
): { unit: string; units_per_serving: number }[] {
  const list = (input ?? [])
    .map((s) => ({
      unit: (s.unit ?? '').trim() || 'serving',
      units_per_serving: Number(s.units_per_serving),
    }))
    .filter((s) => Number.isFinite(s.units_per_serving) && s.units_per_serving > 0);
  // Always need at least one row; otherwise inject 'serving' only when not opted
  // out, so g/ml-basis foods don't carry a meaningless "serving" unit.
  if (!list.some((s) => s.unit === 'serving') && (!omitDefault || list.length === 0)) {
    list.unshift({ unit: 'serving', units_per_serving: 1 });
  }
  return list;
}

// Filter incoming nutrient rows: drop blanks/negative/invalid uuid; dedupe by nutrient_id (last wins).
// A zero amount is meaningful ("0g trans fat" is explicit info on a real label) and is preserved.
function normalizeNutrients(input?: FoodNutrient[]): FoodNutrient[] {
  if (!Array.isArray(input)) return [];
  const seen = new Map<string, number>();
  for (const n of input) {
    if (!n || typeof n.nutrient_id !== 'string') continue;
    const amt = Number(n.amount);
    if (!Number.isFinite(amt) || amt < 0) continue;
    seen.set(n.nutrient_id, amt);
  }
  return Array.from(seen, ([nutrient_id, amount]) => ({ nutrient_id, amount }));
}

// Macros are mirrored into food_nutrients (category='macro' rows) so every
// nutrient-keyed surface — the /nutrition/[code] detail page, foods-highest
// rankings, food breakdowns — resolves them like any micro. The legacy
// foods.*_per_serving columns remain the calculation source of truth for now;
// these rows are kept in lockstep with them on every write. Without this, the
// reconcile delete-sweep below would strip the backfilled macro rows on the
// first edit (the create/update forms only carry micros).
const MACRO_NUTRIENT_FIELDS: { code: string; field: keyof CreateFoodInput }[] = [
  { code: 'kcal', field: 'kcal_per_serving' },
  { code: 'protein', field: 'protein_g_per_serving' },
  { code: 'carbs', field: 'carbs_g_per_serving' },
  { code: 'fat', field: 'fat_g_per_serving' },
];

let __macroIdCache: Record<string, string> | null = null;
async function macroNutrientIds(pool: sql.ConnectionPool): Promise<Record<string, string>> {
  if (__macroIdCache) return __macroIdCache;
  const r = await pool.request().query<{ code: string; id: string }>(
    `SELECT code, id FROM nutrients WHERE category = 'macro'`
  );
  __macroIdCache = Object.fromEntries(r.recordset.map((x) => [x.code, x.id]));
  return __macroIdCache;
}

// Merge the food's macro values (per canonical serving) into a micro nutrient
// list as food_nutrients rows, deduped by nutrient_id. Only positive amounts
// get a row, matching the absent-row=0 convention used for micros.
async function withMacroNutrients(
  pool: sql.ConnectionPool,
  input: CreateFoodInput,
  micros: FoodNutrient[]
): Promise<FoodNutrient[]> {
  const ids = await macroNutrientIds(pool);
  const merged = new Map<string, number>(micros.map((n) => [n.nutrient_id, n.amount]));
  for (const m of MACRO_NUTRIENT_FIELDS) {
    const id = ids[m.code];
    if (!id) continue; // macro nutrient row not seeded yet (pre-migration DB)
    const amount = Number(input[m.field]);
    if (Number.isFinite(amount) && amount > 0) merged.set(id, amount);
  }
  return Array.from(merged, ([nutrient_id, amount]) => ({ nutrient_id, amount }));
}

// Reconcile by nutrient_id: UPDATE existing rows, INSERT new, DELETE missing.
// Avoids dead/duplicate rows and preserves the (food_id, nutrient_id) primary key cleanly.
async function reconcileFoodNutrients(
  pool: sql.ConnectionPool,
  foodId: string,
  nutrients: FoodNutrient[]
): Promise<void> {
  const existing = await pool
    .request()
    .input('foodId', sql.UniqueIdentifier, foodId)
    .query<{ nutrient_id: string }>(
      `SELECT nutrient_id FROM food_nutrients WHERE food_id = @foodId`
    );
  const existingIds = new Set(existing.recordset.map((r) => r.nutrient_id));
  const keep = new Set(nutrients.map((n) => n.nutrient_id));
  for (const n of nutrients) {
    if (existingIds.has(n.nutrient_id)) {
      await pool
        .request()
        .input('foodId', sql.UniqueIdentifier, foodId)
        .input('nutrientId', sql.UniqueIdentifier, n.nutrient_id)
        .input('amount', sql.Decimal(12, 4), n.amount)
        .query(`UPDATE food_nutrients SET amount=@amount
                WHERE food_id=@foodId AND nutrient_id=@nutrientId`);
    } else {
      await pool
        .request()
        .input('foodId', sql.UniqueIdentifier, foodId)
        .input('nutrientId', sql.UniqueIdentifier, n.nutrient_id)
        .input('amount', sql.Decimal(12, 4), n.amount)
        .query(`INSERT INTO food_nutrients (food_id, nutrient_id, amount)
                VALUES (@foodId, @nutrientId, @amount)`);
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

const FOOD_BASE_COLUMNS = `foods.id, foods.user_id, foods.name, foods.brand, foods.source, foods.usda_fdc_id,
              foods.barcode_upc, foods.is_favorite, foods.is_archived, foods.icon`;
// Macros are derived from the nutrient EAV (category='macro' rows), not the
// legacy foods.*_per_serving columns, so the Food contract survives the Phase 5
// column drop. Amounts are per canonical serving (kept in sync on every write).
const MACRO_PIVOT_JOIN = `LEFT JOIN (
                SELECT fn.food_id,
                       MAX(CASE WHEN n.code='kcal'    THEN fn.amount END) AS kcal_per_serving,
                       MAX(CASE WHEN n.code='protein' THEN fn.amount END) AS protein_g_per_serving,
                       MAX(CASE WHEN n.code='carbs'   THEN fn.amount END) AS carbs_g_per_serving,
                       MAX(CASE WHEN n.code='fat'     THEN fn.amount END) AS fat_g_per_serving
                FROM food_nutrients fn JOIN nutrients n ON n.id = fn.nutrient_id AND n.category = 'macro'
                GROUP BY fn.food_id
              ) macro ON macro.food_id = foods.id`;
const MACRO_SELECT = `ISNULL(macro.kcal_per_serving,0) AS kcal_per_serving,
              ISNULL(macro.protein_g_per_serving,0) AS protein_g_per_serving,
              ISNULL(macro.carbs_g_per_serving,0) AS carbs_g_per_serving,
              ISNULL(macro.fat_g_per_serving,0) AS fat_g_per_serving`;
const FOOD_COLUMNS = `${FOOD_BASE_COLUMNS}, ${MACRO_SELECT}`;

const SERVING_COLUMNS = `id, food_id, unit, units_per_serving`;

// Escape the LIKE wildcard metacharacters so a user-typed token is matched
// literally (paired with `ESCAPE '\'` on the LIKE). Without this a '%' or '_'
// in a search term would behave as a wildcard.
function escapeLike(value: string): string {
  return value.replace(/[\\%_[]/g, (char) => `\\${char}`);
}

export async function listFoods(
  userId: string,
  search: string | null,
  barcode?: string | null
): Promise<Food[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const req = pool.request().input('userId', sql.UniqueIdentifier, userId);
    let where = '(user_id = @userId OR user_id IS NULL) AND is_archived = 0';
    if (search) {
      // Token-based search: split the query on whitespace and require EVERY token
      // to appear (as a substring) in name OR brand. This lets "colby jack" match
      // "Colby & monterey jack natural cheese slices" even though the words aren't
      // contiguous — a plain `LIKE '%colby jack%'` would miss it.
      const tokens = search.trim().split(/\s+/).filter(Boolean);
      tokens.forEach((token, index) => {
        const param = `q${index}`;
        req.input(param, sql.NVarChar(255), `%${escapeLike(token)}%`);
        where += ` AND (name LIKE @${param} ESCAPE '\\' OR brand LIKE @${param} ESCAPE '\\')`;
      });
    }
    if (barcode) {
      req.input('barcode', sql.NVarChar(32), barcode);
      where += ' AND barcode_upc = @barcode';
    }
    const foodsResult = await req.query<any>(
      // Join each food's most-recent log ENTRY so search results (a) surface
      // latest-logged foods first and (b) carry that entry's serving + amount as
      // last_serving_id/last_quantity. Tapping a searched food then defaults to what
      // the user actually logged last (e.g. "2 servings" almond milk) instead of a
      // generic "1 serving", mirroring the Latest/Frequent picker rows. ROW_NUMBER
      // picks the single newest entry per food; rn=1 collapses to one row per food so
      // the ORDER BY on last_logged is unchanged from the old MAX(ts_logged).
      `SELECT TOP 200 ${FOOD_COLUMNS},
              recent_logs.serving_id AS last_serving_id,
              recent_logs.quantity AS last_quantity
       FROM foods
       ${MACRO_PIVOT_JOIN}
       LEFT JOIN (
         SELECT food_id, serving_id, quantity, last_logged FROM (
           SELECT food_id, serving_id, quantity, ts_logged AS last_logged,
                  ROW_NUMBER() OVER (PARTITION BY food_id ORDER BY ts_logged DESC) AS rn
           FROM food_entries
           WHERE user_id = @userId AND food_id IS NOT NULL
         ) ranked
         WHERE rn = 1
       ) recent_logs ON recent_logs.food_id = foods.id
       WHERE ${where}
       ORDER BY CASE WHEN recent_logs.last_logged IS NULL THEN 1 ELSE 0 END,
                recent_logs.last_logged DESC, name ASC`
    );
    if (foodsResult.recordset.length === 0) {
      console.warn(`No foods found for user_id: '${userId}'`);
      return [];
    }
    const ids = foodsResult.recordset.map((r) => r.id);
    const servingsResult = await pool
      .request()
      .query<FoodServing>(
        `SELECT ${SERVING_COLUMNS} FROM food_servings
         WHERE food_id IN (${ids.map((id) => `'${id}'`).join(',')})
         ORDER BY CASE WHEN unit='serving' THEN 0 ELSE 1 END, unit ASC`
      );
    const servingsByFood = new Map<string, FoodServing[]>();
    for (const s of servingsResult.recordset) {
      if (!servingsByFood.has(s.food_id)) servingsByFood.set(s.food_id, []);
      servingsByFood.get(s.food_id)!.push({ ...s, units_per_serving: Number(s.units_per_serving) });
    }
    return foodsResult.recordset.map((r) => ({
      ...r,
      kcal_per_serving: Number(r.kcal_per_serving),
      protein_g_per_serving: Number(r.protein_g_per_serving),
      carbs_g_per_serving: Number(r.carbs_g_per_serving),
      fat_g_per_serving: Number(r.fat_g_per_serving),
      is_archived: !!r.is_archived,
      is_favorite: !!r.is_favorite,
      servings: servingsByFood.get(r.id) || [],
      // The serving + amount from this user's most-recent entry for the food, so the
      // logger's details sheet defaults to "last used" rather than "1 serving". Left
      // unset (undefined) for never-logged foods, matching the optional Food contract.
      last_serving_id: r.last_serving_id ?? null,
      last_quantity: r.last_quantity != null ? Number(r.last_quantity) : undefined,
    }));
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Foods richest in a given nutrient, for the nutrient detail page. Ranks by the
// stored food_nutrients.amount (each food's amount is in its OWN backing reference —
// per serving, or per 100 g/ml for omit_default_serving foods), so no normalization
// is applied; the caller labels each row by `basis`. Restricted to foods THIS user
// has actually LOGGED (optionally within a date window), with recipes + archived
// excluded. Logging-scoped on purpose: the bare library is full of never-eaten USDA
// cache foods and mis-imported items, so "foods you log" is the useful, low-noise
// set. The date window filters on entry_date (the diary day the food was eaten), which
// carries the real historical spread — NOT ts_logged (the row insert time, which the
// import collapsed to the import date).
export async function listFoodsHighInNutrient(
  userId: string,
  nutrientId: string,
  limit = 10,
  options: { startDate?: string; endDate?: string } = {}
): Promise<FoodNutrientRanking[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const req = pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('nutrientId', sql.UniqueIdentifier, nutrientId)
      .input('limit', sql.Int, limit);

    // Logged-by-this-user gate, optionally within [startDate, endDate]. Filters on
    // entry_date (the consumed diary day, with real historical spread), NOT ts_logged
    // (import-collapsed insert time). entry_date is a DATE, so the bounds are plain
    // inclusive comparisons.
    const entryConds = ['e.food_id = f.id', 'e.user_id = @userId'];
    // Same optional window, as a fragment injected into the total-consumed halves
    // below (which alias food_entries as `e` too).
    let entryDateFilter = '';
    if (options.startDate) {
      req.input('startDate', sql.Date, options.startDate);
      entryConds.push('e.entry_date >= @startDate');
      entryDateFilter += ' AND e.entry_date >= @startDate';
    }
    if (options.endDate) {
      req.input('endDate', sql.Date, options.endDate);
      entryConds.push('e.entry_date <= @endDate');
      entryDateFilter += ' AND e.entry_date <= @endDate';
    }

    const result = await req
      .query<any>(
        // Dedupe by name+brand (the food library carries duplicate imports — keep the
        // highest-amount instance per name) so the top-N isn't filled by repeats.
        // `basis` = how the amount is referenced: a 100-unit g/ml serving row is the
        // per-100 g/ml signal (USDA / omit_default_serving foods store amounts per
        // 100 g and ALSO carry a generic 'serving' row, so check the 100-unit row
        // FIRST); a food with only a real 'serving' portion is serving-backed.
        //
        // Two sort metrics are returned per row so the detail page can toggle between
        // them WITHOUT a refetch: `amount` (per-serving density, above) and
        // `total_consumed` (how much of this nutrient was actually eaten across the
        // window, grouped by name+brand so all duplicate food rows roll into one
        // total). A food can rank top-N by total without ranking top-N by density (or
        // vice-versa), so we return the UNION of each metric's top-N (≤ 2·@limit rows)
        // and let the client slice per metric.
        //
        // `consumed` mirrors getRangeTotals (entryFunctions.ts): consumed amount =
        // food_nutrients.amount (per canonical serving) × serving count, where serving
        // count = quantity / units_per_serving (or raw quantity when the entry has no
        // serving_id — quantity is grams then). It's a two-source UNION: live
        // food_nutrients for normal entries, plus food_entry_nutrients snapshots for
        // frozen recipes/quick-adds; the NOT EXISTS guard keeps a snapshotted entry
        // out of the live half so it isn't double-counted. Recipes are excluded to
        // match the density list's scope (both modes act on the same food set).
        `WITH consumed_raw AS (
           SELECT f.name AS name, ISNULL(f.brand, '') AS brand_key,
                  fn.amount * CASE WHEN s.units_per_serving > 0 THEN e.quantity / s.units_per_serving ELSE e.quantity END AS amt
           FROM food_entries e
           JOIN foods f ON f.id = e.food_id
           JOIN food_nutrients fn ON fn.food_id = e.food_id AND fn.nutrient_id = @nutrientId
           LEFT JOIN food_servings s ON s.id = e.serving_id
           WHERE e.user_id = @userId
             AND e.food_id IS NOT NULL
             AND f.is_archived = 0
             AND f.source <> 'recipe'
             AND NOT EXISTS (SELECT 1 FROM food_entry_nutrients fx WHERE fx.entry_id = e.id)${entryDateFilter}
           UNION ALL
           SELECT f.name AS name, ISNULL(f.brand, '') AS brand_key,
                  fen.amount * CASE WHEN s.units_per_serving > 0 THEN e.quantity / s.units_per_serving ELSE e.quantity END AS amt
           FROM food_entries e
           JOIN foods f ON f.id = e.food_id
           JOIN food_entry_nutrients fen ON fen.entry_id = e.id AND fen.nutrient_id = @nutrientId
           LEFT JOIN food_servings s ON s.id = e.serving_id
           WHERE e.user_id = @userId
             AND e.food_id IS NOT NULL
             AND f.is_archived = 0
             AND f.source <> 'recipe'${entryDateFilter}
         ),
         consumed AS (
           SELECT name, brand_key, SUM(amt) AS total_consumed
           FROM consumed_raw
           GROUP BY name, brand_key
         ),
         ranked AS (
           SELECT f.id AS food_id, f.name, f.brand, f.icon, fn.amount,
                  ROW_NUMBER() OVER (
                    PARTITION BY f.name, ISNULL(f.brand, '')
                    ORDER BY fn.amount DESC, f.id
                  ) AS rn
           FROM food_nutrients fn
           JOIN foods f ON f.id = fn.food_id
           WHERE fn.nutrient_id = @nutrientId
             AND fn.amount > 0
             AND f.is_archived = 0
             AND f.source <> 'recipe'
             AND EXISTS (SELECT 1 FROM food_entries e WHERE ${entryConds.join(' AND ')})
         ),
         reps AS (
           SELECT ranked.food_id, ranked.name, ranked.brand, ranked.icon, ranked.amount,
                  ISNULL(c.total_consumed, 0) AS total_consumed,
                  CASE
                    WHEN EXISTS (SELECT 1 FROM food_servings s WHERE s.food_id = ranked.food_id AND s.unit = 'g'  AND s.units_per_serving = 100) THEN '100g'
                    WHEN EXISTS (SELECT 1 FROM food_servings s WHERE s.food_id = ranked.food_id AND s.unit = 'ml' AND s.units_per_serving = 100) THEN '100ml'
                    WHEN EXISTS (SELECT 1 FROM food_servings s WHERE s.food_id = ranked.food_id AND s.unit = 'serving') THEN 'serving'
                    ELSE 'serving'
                  END AS basis
           FROM ranked
           LEFT JOIN consumed c ON c.name = ranked.name AND c.brand_key = ISNULL(ranked.brand, '')
           WHERE ranked.rn = 1
         ),
         scored AS (
           SELECT reps.*,
                  ROW_NUMBER() OVER (ORDER BY amount DESC) AS rn_serving,
                  ROW_NUMBER() OVER (ORDER BY total_consumed DESC, amount DESC) AS rn_total
           FROM reps
         )
         SELECT food_id, name, brand, icon, amount, total_consumed, basis
         FROM scored
         WHERE rn_serving <= @limit OR rn_total <= @limit
         ORDER BY amount DESC`
      );
    if (result.recordset.length === 0) {
      console.warn(`No logged foods found high in nutrient_id: '${nutrientId}'`);
      return [];
    }
    return result.recordset.map((r) => ({
      food_id: r.food_id,
      name: r.name,
      brand: r.brand ?? null,
      icon: r.icon ?? null,
      amount: Number(r.amount),
      basis: r.basis as FoodNutrientRanking['basis'],
      total_consumed: Number(r.total_consumed),
    }));
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function getFood(userId: string, foodId: string): Promise<Food> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, foodId)
      .input('userId', sql.UniqueIdentifier, userId)
      .query<any>(
        `SELECT ${FOOD_COLUMNS}
         FROM foods
         ${MACRO_PIVOT_JOIN}
         WHERE foods.id = @foodId AND (foods.user_id = @userId OR foods.user_id IS NULL)`
      );
    if (result.recordset.length === 0) {
      throw new Error(`No food found for id: '${foodId}'`);
    }
    const servings = await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, foodId)
      .query<FoodServing>(
        `SELECT ${SERVING_COLUMNS} FROM food_servings
         WHERE food_id = @foodId
         ORDER BY CASE WHEN unit='serving' THEN 0 ELSE 1 END, unit ASC`
      );
    const nutrients = await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, foodId)
      .query<{ nutrient_id: string; amount: number }>(
        // Exclude macro rows: a food's macros surface via the dedicated
        // kcal/protein/carbs/fat fields, not its micronutrient list.
        `SELECT fn.nutrient_id, fn.amount
         FROM food_nutrients fn JOIN nutrients n ON n.id = fn.nutrient_id
         WHERE fn.food_id = @foodId AND n.category <> 'macro'`
      );
    const r = result.recordset[0];
    return {
      ...r,
      kcal_per_serving: Number(r.kcal_per_serving),
      protein_g_per_serving: Number(r.protein_g_per_serving),
      carbs_g_per_serving: Number(r.carbs_g_per_serving),
      fat_g_per_serving: Number(r.fat_g_per_serving),
      is_archived: !!r.is_archived,
      is_favorite: !!r.is_favorite,
      servings: servings.recordset.map((s) => ({ ...s, units_per_serving: Number(s.units_per_serving) })),
      nutrients: nutrients.recordset.map((n) => ({
        nutrient_id: n.nutrient_id,
        amount: Number(n.amount),
      })),
    };
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Number of trailing 7-day buckets surfaced in the food-usage frequency chart.
const USAGE_WEEKS = 12;

// How often a food has been logged. Powers the "Usage" card on the food detail
// page: all-time headline counts (total entries, distinct days, first/last) plus
// a trailing weekly-frequency series for the bar chart. Always returns a row —
// an unlogged food reports zeros and an all-empty weekly series, never throws.
export async function getFoodUsage(userId: string, foodId: string): Promise<FoodUsageStats> {
  let pool;
  try {
    pool = await getFoodConnection();
    // All-time aggregates. COUNT/MIN/MAX always yield a single row (zeros + nulls
    // when the food was never logged), so this is a multi-record-style read — no
    // 404 throw, the card just shows its empty state.
    const agg = await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, foodId)
      .input('userId', sql.UniqueIdentifier, userId)
      .query<any>(
        `SELECT COUNT(*) AS total_entries,
                COUNT(DISTINCT entry_date) AS distinct_days,
                CONVERT(varchar(10), MIN(entry_date), 23) AS first_logged,
                CONVERT(varchar(10), MAX(entry_date), 23) AS last_logged
         FROM food_entries
         WHERE food_id = @foodId AND user_id = @userId`
      );
    // Per-day counts across the trailing window; bucketed into weeks in JS so we
    // don't depend on DATEFIRST/locale week boundaries inside SQL Server.
    const daily = await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, foodId)
      .input('userId', sql.UniqueIdentifier, userId)
      .query<{ d: string; c: number }>(
        `SELECT CONVERT(varchar(10), entry_date, 23) AS d, COUNT(*) AS c
         FROM food_entries
         WHERE food_id = @foodId AND user_id = @userId
           AND entry_date >= DATEADD(day, -${USAGE_WEEKS * 7 - 1}, CAST(GETDATE() AS date))
         GROUP BY entry_date`
      );

    // Build USAGE_WEEKS buckets, oldest → newest. The newest bucket ends today and
    // each bucket spans 7 days, so bucket i (0-based, oldest first) starts
    // (USAGE_WEEKS-1-i)*7 + 6 days before today.
    const DAY_MS = 86400000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const toIso = (dt: Date) =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

    const weekly: FoodUsageStats['weekly'] = [];
    for (let i = USAGE_WEEKS - 1; i >= 0; i--) {
      const start = new Date(today);
      start.setDate(start.getDate() - (i * 7 + 6));
      weekly.push({ week_start: toIso(start), count: 0 });
    }
    for (const row of daily.recordset) {
      const dt = new Date(`${row.d}T00:00:00`);
      const daysAgo = Math.floor((today.getTime() - dt.getTime()) / DAY_MS);
      const weeksAgo = Math.floor(daysAgo / 7); // 0 = current 7-day window
      if (weeksAgo >= 0 && weeksAgo < USAGE_WEEKS) {
        weekly[USAGE_WEEKS - 1 - weeksAgo].count += Number(row.c);
      }
    }

    const a = agg.recordset[0];
    return {
      total_entries: Number(a.total_entries) || 0,
      distinct_days: Number(a.distinct_days) || 0,
      first_logged: a.first_logged ?? null,
      last_logged: a.last_logged ?? null,
      weekly,
    };
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function createFood(userId: string, input: CreateFoodInput): Promise<Food> {
  let pool;
  try {
    pool = await getFoodConnection();

    // BLOCK DUPLICATE BARCODES — a UPC already present in the user's library (or a
    // global food) would create a second copy of the same product. Refuse instead.
    // Scope mirrors the logger's barcode lookup: own foods OR globals, not archived.
    if (input.barcode_upc) {
      const dup = await pool
        .request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('barcode', sql.NVarChar(32), input.barcode_upc)
        .query<{ id: string; name: string }>(
          `SELECT TOP 1 id, name FROM foods
           WHERE barcode_upc = @barcode AND is_archived = 0
             AND (user_id = @userId OR user_id IS NULL)`
        );
      if (dup.recordset.length > 0) {
        throw new DuplicateBarcodeError(dup.recordset[0].id, dup.recordset[0].name);
      }
    }

    const insert = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('name', sql.NVarChar(255), input.name)
      .input('brand', sql.NVarChar(255), input.brand ?? null)
      .input('icon', sql.NVarChar(32), input.icon ?? null)
      .input('barcode', sql.NVarChar(32), input.barcode_upc ?? null)
      .input('source', sql.NVarChar(16), input.source ?? 'user')
      .input('fdcId', sql.Int, input.usda_fdc_id ?? null)
      // Macros are written as food_nutrients rows (withMacroNutrients below), not
      // foods columns — those columns were dropped in the macro→nutrient migration.
      .query<{ id: string }>(
        `INSERT INTO foods (user_id, name, brand, source, usda_fdc_id, icon, barcode_upc)
         OUTPUT INSERTED.id
         VALUES (@userId, @name, @brand, @source, @fdcId, @icon, @barcode)`
      );
    const newId = insert.recordset[0].id;
    const servings = normalizeServings(input.servings, input.omit_default_serving);
    for (const s of servings) {
      await pool
        .request()
        .input('foodId', sql.UniqueIdentifier, newId)
        .input('unit', sql.NVarChar(32), s.unit)
        .input('ups', sql.Decimal(10, 4), s.units_per_serving)
        .query(`INSERT INTO food_servings (food_id, unit, units_per_serving) VALUES (@foodId, @unit, @ups)`);
    }
    await reconcileFoodNutrients(pool, newId, await withMacroNutrients(pool, input, normalizeNutrients(input.nutrients)));
    return await getFood(userId, newId);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function updateFood(userId: string, foodId: string, input: CreateFoodInput): Promise<Food> {
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, foodId)
      .input('userId', sql.UniqueIdentifier, userId)
      .input('name', sql.NVarChar(255), input.name)
      .input('brand', sql.NVarChar(255), input.brand ?? null)
      .input('icon', sql.NVarChar(32), input.icon ?? null)
      .input('barcode', sql.NVarChar(32), input.barcode_upc ?? null)
      // Macros are reconciled into food_nutrients (withMacroNutrients below), not
      // foods columns — those were dropped in the macro→nutrient migration.
      .query(
        `UPDATE foods SET name=@name, brand=@brand,
           icon=@icon, barcode_upc=@barcode,
           ts_updated=GETDATE()
         WHERE id=@foodId AND user_id=@userId`
      );
    // Reconcile servings by unit name so existing rows keep their UUIDs.
    // Wholesale DELETE+INSERT would orphan every food_entries.serving_id pointing here.
    const servings = normalizeServings(input.servings);
    const existing = await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, foodId)
      .query<{ id: string; unit: string }>(
        `SELECT id, unit FROM food_servings WHERE food_id=@foodId`
      );
    const existingByUnit = new Map(existing.recordset.map((r) => [r.unit, r.id]));
    const keepUnits = new Set(servings.map((s) => s.unit));
    for (const s of servings) {
      const id = existingByUnit.get(s.unit);
      if (id) {
        await pool
          .request()
          .input('id', sql.UniqueIdentifier, id)
          .input('ups', sql.Decimal(10, 4), s.units_per_serving)
          .query(`UPDATE food_servings SET units_per_serving=@ups WHERE id=@id`);
      } else {
        await pool
          .request()
          .input('foodId', sql.UniqueIdentifier, foodId)
          .input('unit', sql.NVarChar(32), s.unit)
          .input('ups', sql.Decimal(10, 4), s.units_per_serving)
          .query(`INSERT INTO food_servings (food_id, unit, units_per_serving) VALUES (@foodId, @unit, @ups)`);
      }
    }
    for (const r of existing.recordset) {
      if (!keepUnits.has(r.unit)) {
        await pool
          .request()
          .input('id', sql.UniqueIdentifier, r.id)
          .query(`DELETE FROM food_servings WHERE id=@id`);
      }
    }
    await reconcileFoodNutrients(pool, foodId, await withMacroNutrients(pool, input, normalizeNutrients(input.nutrients)));
    return await getFood(userId, foodId);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function setFoodFavorite(userId: string, foodId: string, isFavorite: boolean): Promise<void> {
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, foodId)
      .input('userId', sql.UniqueIdentifier, userId)
      .input('fav', sql.Bit, isFavorite ? 1 : 0)
      .query(`UPDATE foods SET is_favorite=@fav, ts_updated=GETDATE() WHERE id=@foodId AND user_id=@userId`);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function listFavoriteFoods(userId: string): Promise<Food[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query<any>(
        `SELECT ${FOOD_COLUMNS}
         FROM foods
         WHERE user_id=@userId AND is_favorite=1 AND is_archived=0
         ORDER BY name ASC`
      );
    return result.recordset.map((r) => ({
      ...r,
      kcal_per_serving: Number(r.kcal_per_serving),
      protein_g_per_serving: Number(r.protein_g_per_serving),
      carbs_g_per_serving: Number(r.carbs_g_per_serving),
      fat_g_per_serving: Number(r.fat_g_per_serving),
      is_archived: !!r.is_archived,
      is_favorite: !!r.is_favorite,
      servings: [],
    }));
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Add a single unit-of-measure row to a food, idempotently. If the food already
// carries <unit> (case-insensitive), the existing row is returned unchanged.
// Used by the recipe-import resolver to teach a food the recipe's own unit
// (e.g. add a 'cup' row to a food that only had 'serving'/'g'). Additive only —
// existing serving rows (and any food_entries.serving_id pointing at them) are
// untouched.
export async function addFoodServing(
  userId: string,
  foodId: string,
  unit: string,
  unitsPerServing: number
): Promise<FoodServing> {
  const cleanUnit = (unit ?? '').trim() || 'serving';
  const ups = Number(unitsPerServing);
  if (!Number.isFinite(ups) || ups <= 0) {
    throw new Error(`Invalid units_per_serving '${unitsPerServing}' for unit: '${cleanUnit}'`);
  }
  let pool;
  try {
    pool = await getFoodConnection();
    // Only mutate a food the user owns (or a global generic).
    const owner = await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, foodId)
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`SELECT id FROM foods WHERE id=@foodId AND (user_id=@userId OR user_id IS NULL)`);
    if (owner.recordset.length === 0) {
      throw new Error(`No food found for id: '${foodId}'`);
    }
    // Idempotent: reuse the existing row if this unit is already present.
    const existing = await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, foodId)
      .input('unit', sql.NVarChar(32), cleanUnit)
      .query<FoodServing>(
        `SELECT ${SERVING_COLUMNS} FROM food_servings
         WHERE food_id=@foodId AND LOWER(unit)=LOWER(@unit)`
      );
    if (existing.recordset.length > 0) {
      const row = existing.recordset[0];
      return { ...row, units_per_serving: Number(row.units_per_serving) };
    }
    const inserted = await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, foodId)
      .input('unit', sql.NVarChar(32), cleanUnit)
      .input('ups', sql.Decimal(10, 4), ups)
      .query<FoodServing>(
        `INSERT INTO food_servings (food_id, unit, units_per_serving)
         OUTPUT INSERTED.id, INSERTED.food_id, INSERTED.unit, INSERTED.units_per_serving
         VALUES (@foodId, @unit, @ups)`
      );
    const row = inserted.recordset[0];
    return { ...row, units_per_serving: Number(row.units_per_serving) };
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function archiveFood(userId: string, foodId: string): Promise<void> {
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('foodId', sql.UniqueIdentifier, foodId)
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`UPDATE foods SET is_archived=1, ts_updated=GETDATE() WHERE id=@foodId AND user_id=@userId`);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}
