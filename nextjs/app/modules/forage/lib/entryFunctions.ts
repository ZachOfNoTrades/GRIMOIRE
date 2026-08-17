import sql from 'mssql';
import { getFoodConnection, closeFoodConnection } from './db';
import { FoodEntry, DailyTotals } from '../types/entry';
import { NutrientDailyPoint } from '../types/food';

// Macro nutrient codes → the FoodEntry/DailyTotals fields they populate. Macros
// are now ordinary nutrient rows (category='macro'); an entry's macros are
// derived from the unified nutrient amounts (food_nutrients for food-backed
// entries, food_entry_nutrients for quick-adds) rather than dedicated columns.
const MACRO_CODE_TO_FIELD: Record<string, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'> = {
  kcal: 'kcal',
  protein: 'protein_g',
  carbs: 'carbs_g',
  fat: 'fat_g',
};

interface CreateEntryInput {
  entry_date: string;
  entry_time?: string | null; // "HH:MM" or "HH:MM:SS"; null => DB default (now)
  food_id?: string | null;
  serving_id?: string | null;
  quantity: number;
  quick_add_name?: string | null;
  quick_add_kcal?: number | null;
  quick_add_protein_g?: number | null;
  quick_add_carbs_g?: number | null;
  quick_add_fat_g?: number | null;
  // Explicit log timestamp (ISO). Lets a multi-food plate commit pass one
  // monotonically-increasing value per item so the diary's ORDER BY ts_logged
  // tiebreak preserves plate order on the reconciling refetch — parallel POSTs
  // otherwise tie on the DEFAULT GETDATE() (~3.33ms ticks) and reshuffle. Omit
  // for the single-entry path => DB default (now).
  ts_logged?: string | null;
}

const ENTRY_SELECT_COLUMNS = `e.id, e.user_id, CONVERT(varchar(10), e.entry_date, 23) AS entry_date,
                CONVERT(varchar(8), e.entry_time, 108) AS entry_time,
                e.food_id, e.serving_id, e.quantity,
                e.quick_add_name, e.ts_logged,
                f.name AS food_name, f.brand AS food_brand, f.source AS food_source,
                s.units_per_serving AS serving_ups, s.unit AS serving_unit`;

// Build a FoodEntry from a row + its RAW (unrounded) scaled nutrient amounts
// (see loadEntryMicros). Macros are pulled out of the nutrient map into the
// dedicated kcal/protein_g/carbs_g/fat_g fields (rounded to 1 dp, as before);
// the full per-entry nutrient map is rounded to 2 dp and still includes the
// macro codes, so consumers keyed on nutrient code (e.g. the macro detail
// page) read consumed macros the same way as any micro.
function rowToFoodEntry(r: any, microsRaw: Record<string, number> = {}): FoodEntry {
  const macros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  const micros: Record<string, number> = {};
  for (const code in microsRaw) {
    const field = MACRO_CODE_TO_FIELD[code];
    if (field) macros[field] = round1(microsRaw[code]);
    micros[code] = round2(microsRaw[code]);
  }
  return {
    id: r.id,
    user_id: r.user_id,
    entry_date: r.entry_date,
    entry_time: r.entry_time,
    food_id: r.food_id,
    serving_id: r.serving_id,
    quantity: Number(r.quantity),
    quick_add_name: r.quick_add_name,
    serving_unit: r.serving_unit ?? null,
    display_name: r.food_id ? r.food_name : r.quick_add_name,
    brand: r.food_id ? (r.food_brand ?? null) : null,
    food_source: r.food_id ? (r.food_source ?? null) : null,
    kcal: macros.kcal,
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    fat_g: macros.fat_g,
    micros,
    ts_logged: r.ts_logged,
  };
}

// Fetch the per-entry nutrient amounts for the given rows in two batched queries
// and return a per-entry Record<code, RAW (unrounded) scaled amount>. Two
// sources, unified by code, with the per-entry source taking PRECEDENCE:
//   • per-entry food_entry_nutrients → foodless quick-adds AND frozen recipe logs
//     (a recipe's nutrients snapshotted at log time — see snapshotRecipeNutrients)
//   • food-backed entries WITHOUT a snapshot → the food's live food_nutrients
// Both are per-serving and scaled by the entry's serving count (quantity / ups;
// serving-less ⇒ the raw quantity), so the two sources scale identically — a
// recipe's canonical 'serving' (ups=1) makes its snapshot scale by the raw
// quantity, exactly as a quick-add does. Macros (kcal/protein/carbs/fat) are
// ordinary nutrient rows, so they flow through here too. Amounts are LEFT
// UNROUNDED; rowToFoodEntry does the display rounding, avoiding double-rounding
// drift on the derived macro fields.
async function loadEntryMicros(
  pool: sql.ConnectionPool,
  rows: any[]
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  const add = (entryId: string, code: string, scaled: number) => {
    if (!(scaled > 0)) return;
    const m = out.get(entryId) ?? {};
    m[code] = (m[code] ?? 0) + scaled;
    out.set(entryId, m);
  };
  // Serving count for an entry: quantity / units_per_serving (serving-less ⇒ the
  // raw quantity). Used to scale BOTH per-serving sources the same way.
  const servingsFor = (r: any): number => {
    const ups = r.serving_ups != null ? Number(r.serving_ups) : null;
    return ups != null && ups > 0 ? Number(r.quantity) / ups : Number(r.quantity);
  };

  // --- Per-entry snapshot rows (food_entry_nutrients): quick-adds AND frozen
  // recipe logs. When present they OVERRIDE the food's live food_nutrients, so a
  // recipe edit can't retroactively rewrite a past log. ---
  const snapshotEntryIds = new Set<string>();
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id as string);
    const req = pool.request();
    const params = ids.map((id, i) => {
      const name = `e${i}`;
      req.input(name, sql.UniqueIdentifier, id);
      return `@${name}`;
    });
    const result = await req.query<{ entry_id: string; code: string; amount: number }>(
      `SELECT fen.entry_id, n.code, fen.amount
       FROM food_entry_nutrients fen
       JOIN nutrients n ON n.id = fen.nutrient_id
       WHERE fen.entry_id IN (${params.join(',')}) AND n.is_active = 1`
    );
    const byEntry = new Map<string, { code: string; amount: number }[]>();
    for (const m of result.recordset) {
      snapshotEntryIds.add(m.entry_id);
      if (!byEntry.has(m.entry_id)) byEntry.set(m.entry_id, []);
      byEntry.get(m.entry_id)!.push({ code: m.code, amount: Number(m.amount) });
    }
    for (const r of rows) {
      const list = byEntry.get(r.id);
      if (!list) continue;
      const servings = servingsFor(r);
      for (const { code, amount } of list) add(r.id, code, amount * servings);
    }
  }

  // --- Food-backed entries WITHOUT a snapshot: scale the food's food_nutrients by
  // serving count, read live. (A snapshot, where present, already won above.) ---
  const foodRows = rows.filter((r) => r.food_id && !snapshotEntryIds.has(r.id));
  if (foodRows.length > 0) {
    const foodIds = Array.from(new Set(foodRows.map((r) => r.food_id as string)));
    const req = pool.request();
    const params = foodIds.map((id, i) => {
      const name = `f${i}`;
      req.input(name, sql.UniqueIdentifier, id);
      return `@${name}`;
    });
    const result = await req.query<{ food_id: string; code: string; amount: number }>(
      `SELECT fn.food_id, n.code, fn.amount
       FROM food_nutrients fn
       JOIN nutrients n ON n.id = fn.nutrient_id
       WHERE fn.food_id IN (${params.join(',')}) AND n.is_active = 1`
    );
    const byFood = new Map<string, { code: string; amount: number }[]>();
    for (const m of result.recordset) {
      if (!byFood.has(m.food_id)) byFood.set(m.food_id, []);
      byFood.get(m.food_id)!.push({ code: m.code, amount: Number(m.amount) });
    }
    for (const r of foodRows) {
      const list = byFood.get(r.food_id);
      if (!list) continue;
      for (const { code, amount } of list) add(r.id, code, amount * servingsFor(r));
    }
  }

  return out;
}

// Macro code → nutrient_id, cached per process (the macro reference set is fixed).
let __macroIdCache: Record<string, string> | null = null;
async function macroNutrientIds(pool: sql.ConnectionPool): Promise<Record<string, string>> {
  if (__macroIdCache) return __macroIdCache;
  const r = await pool.request().query<{ code: string; id: string }>(
    `SELECT code, id FROM nutrients WHERE category = 'macro'`
  );
  __macroIdCache = Object.fromEntries(r.recordset.map((x) => [x.code, x.id]));
  return __macroIdCache;
}

// A foodless quick-add's macros, per unit (quantity = 1). undefined fields are
// treated as absent (no row); used to reconcile food_entry_nutrients on write.
interface QuickAddMacros {
  kcal?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
}

// Keep a foodless entry's macros stored in food_entry_nutrients (the sole macro
// store now — the quick_add_* columns were dropped in the macro→nutrient
// migration). Food-backed entries carry no entry-level rows (the food's
// food_nutrients provide them), so any stale rows are cleared.
//   • opts.foodId — the entry's food_id; if omitted, read from the DB. Truthy ⇒
//     food-backed ⇒ clear rows.
//   • opts.macros — the quick-add macro values to write. Omit to leave existing
//     rows untouched (e.g. a quantity-only edit; amounts scale at read time).
async function syncEntryNutrients(
  pool: sql.ConnectionPool,
  entryId: string,
  opts: { foodId?: string | null; macros?: QuickAddMacros } = {}
): Promise<void> {
  let foodId = opts.foodId;
  if (foodId === undefined) {
    const r = await pool
      .request()
      .input('id', sql.UniqueIdentifier, entryId)
      .query<{ food_id: string | null }>(`SELECT food_id FROM food_entries WHERE id = @id`);
    if (r.recordset.length === 0) return;
    foodId = r.recordset[0].food_id;
  }
  if (foodId) {
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, entryId)
      .query(`DELETE FROM food_entry_nutrients WHERE entry_id = @id`);
    return;
  }
  if (opts.macros === undefined) return; // nothing to re-sync (non-macro edit)
  const macros = opts.macros;
  const ids = await macroNutrientIds(pool);
  const want = (
    [
      ['kcal', macros.kcal],
      ['protein', macros.protein],
      ['carbs', macros.carbs],
      ['fat', macros.fat],
    ] as const
  )
    .map(([code, v]) => ({ nutrient_id: ids[code], amount: Number(v) }))
    .filter((x) => x.nutrient_id && Number.isFinite(x.amount) && x.amount > 0);
  const existing = await pool
    .request()
    .input('id', sql.UniqueIdentifier, entryId)
    .query<{ nutrient_id: string }>(`SELECT nutrient_id FROM food_entry_nutrients WHERE entry_id = @id`);
  const existingIds = new Set(existing.recordset.map((x) => x.nutrient_id));
  const keep = new Set(want.map((w) => w.nutrient_id));
  for (const w of want) {
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, entryId)
      .input('nid', sql.UniqueIdentifier, w.nutrient_id)
      .input('amt', sql.Decimal(12, 4), w.amount)
      .query(
        existingIds.has(w.nutrient_id)
          ? `UPDATE food_entry_nutrients SET amount=@amt WHERE entry_id=@id AND nutrient_id=@nid`
          : `INSERT INTO food_entry_nutrients (entry_id, nutrient_id, amount) VALUES (@id, @nid, @amt)`
      );
  }
  for (const nid of existingIds) {
    if (!keep.has(nid)) {
      await pool
        .request()
        .input('id', sql.UniqueIdentifier, entryId)
        .input('nid', sql.UniqueIdentifier, nid)
        .query(`DELETE FROM food_entry_nutrients WHERE entry_id=@id AND nutrient_id=@nid`);
    }
  }
}

// Resolve a food's source ('user' | 'usda' | 'recipe' | 'generic'). Null if the
// food row is missing (shouldn't happen for a valid entry link).
async function getFoodSource(pool: sql.ConnectionPool, foodId: string): Promise<string | null> {
  const r = await pool
    .request()
    .input('id', sql.UniqueIdentifier, foodId)
    .query<{ source: string }>(`SELECT source FROM foods WHERE id = @id`);
  return r.recordset[0]?.source ?? null;
}

// Freeze a recipe-backed entry's nutrition at log time. A recipe's per-serving
// macros + micros live in its foods row's food_nutrients, recomputed on every
// recipe edit (refreshRecipeFoodRow). Entries normally read nutrition LIVE by
// joining food_nutrients via food_id, so editing a recipe would retroactively
// rewrite every past log of it. We copy the recipe's CURRENT per-serving
// food_nutrients into food_entry_nutrients for this entry; the read path
// (loadEntryMicros / getRangeTotals / getNutrientDailySeries) prefers these
// per-entry rows when present, so a logged recipe stays frozen even after the
// recipe changes. food_id still points at the live recipe, so display name,
// recency, frequency, pairing, and "explode" keep resolving the canonical recipe.
async function snapshotRecipeNutrients(
  pool: sql.ConnectionPool,
  entryId: string,
  recipeFoodId: string
): Promise<void> {
  // Drop any prior snapshot (e.g. an edit re-linked this entry to a recipe).
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, entryId)
    .query(`DELETE FROM food_entry_nutrients WHERE entry_id = @id`);
  // Copy the recipe foods row's per-serving nutrient rows verbatim (one round trip).
  await pool
    .request()
    .input('entryId', sql.UniqueIdentifier, entryId)
    .input('foodId', sql.UniqueIdentifier, recipeFoodId)
    .query(`INSERT INTO food_entry_nutrients (entry_id, nutrient_id, amount)
            SELECT @entryId, fn.nutrient_id, fn.amount
            FROM food_nutrients fn
            WHERE fn.food_id = @foodId`);
}

// Reconcile an entry's per-entry nutrient rows (food_entry_nutrients) after a
// create or a food re-link. Three cases keyed on the entry's food link:
//   • recipe food → snapshot the recipe's current per-serving nutrients (freeze)
//   • normal food → clear any rows (the food's own food_nutrients are read live)
//   • no food     → write the quick-add macros
async function applyEntryNutrients(
  pool: sql.ConnectionPool,
  entryId: string,
  foodId: string | null,
  macros?: QuickAddMacros
): Promise<void> {
  if (foodId) {
    if ((await getFoodSource(pool, foodId)) === 'recipe') {
      await snapshotRecipeNutrients(pool, entryId, foodId);
      return;
    }
    await syncEntryNutrients(pool, entryId, { foodId }); // normal food → clear rows
    return;
  }
  await syncEntryNutrients(pool, entryId, { foodId: null, macros });
}

export async function getEntry(userId: string, entryId: string): Promise<FoodEntry | null> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('entryId', sql.UniqueIdentifier, entryId)
      .query<any>(
        `SELECT ${ENTRY_SELECT_COLUMNS}
         FROM food_entries e
         LEFT JOIN foods f ON f.id = e.food_id
         LEFT JOIN food_servings s ON s.id = e.serving_id
         WHERE e.id = @entryId AND e.user_id = @userId`
      );
    if (result.recordset.length === 0) return null;
    const microMap = await loadEntryMicros(pool, result.recordset);
    return rowToFoodEntry(result.recordset[0], microMap.get(result.recordset[0].id) ?? {});
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function listEntries(userId: string, date: string): Promise<FoodEntry[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('date', sql.Date, date)
      .query<any>(
        `SELECT ${ENTRY_SELECT_COLUMNS}
         FROM food_entries e
         LEFT JOIN foods f ON f.id = e.food_id
         LEFT JOIN food_servings s ON s.id = e.serving_id
         WHERE e.user_id = @userId AND e.entry_date = @date
         ORDER BY e.entry_time ASC, e.ts_logged ASC`
      );
    if (result.recordset.length === 0) {
      console.warn(`No entries found for user_id: '${userId}' date: '${date}'`);
      return [];
    }
    const microMap = await loadEntryMicros(pool, result.recordset);
    return result.recordset.map((r) => rowToFoodEntry(r, microMap.get(r.id) ?? {}));
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// A double-tap, a slow-network retry, or a second tab can fire the same log
// twice within milliseconds of each other. sp_getapplock serializes creates
// per-user so the two requests can't both pass the duplicate check below,
// and any identical entry already logged in the last DUPLICATE_SUBMIT_WINDOW_MS
// is treated as that same double-submit rather than a second real log.
const DUPLICATE_SUBMIT_WINDOW_MS = 1500;

export async function createEntry(userId: string, input: CreateEntryInput): Promise<{ id: string }> {
  let pool;
  try {
    pool = await getFoodConnection();
    const time = input.entry_time
      ? input.entry_time.length === 5
        ? `${input.entry_time}:00`
        : input.entry_time
      : null;
    // Optional explicit log timestamp (plate-order tiebreak — see CreateEntryInput).
    // Only bind a column when a valid date is supplied; otherwise fall through to
    // the DEFAULT GETDATE().
    const tsLogged = input.ts_logged ? new Date(input.ts_logged) : null;
    const hasTs = !!tsLogged && !Number.isNaN(tsLogged.getTime());

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx)
        .input('resource', sql.NVarChar(255), `forage_entry:${userId}`)
        .query(
          `EXEC sp_getapplock @Resource=@resource, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=5000`
        );

      const dup = await new sql.Request(tx)
        .input('userId', sql.UniqueIdentifier, userId)
        .input('entryDate', sql.Date, input.entry_date)
        .input('foodId', sql.UniqueIdentifier, input.food_id ?? null)
        .input('servingId', sql.UniqueIdentifier, input.serving_id ?? null)
        .input('quantity', sql.Decimal(8, 3), input.quantity)
        .input('qName', sql.NVarChar(255), input.quick_add_name ?? null).query<{ id: string }>(`
          SELECT TOP 1 id FROM food_entries
          WHERE user_id = @userId AND entry_date = @entryDate
            AND ISNULL(food_id, '00000000-0000-0000-0000-000000000000') = ISNULL(@foodId, '00000000-0000-0000-0000-000000000000')
            AND ISNULL(serving_id, '00000000-0000-0000-0000-000000000000') = ISNULL(@servingId, '00000000-0000-0000-0000-000000000000')
            AND ISNULL(quick_add_name, '') = ISNULL(@qName, '')
            AND quantity = @quantity
            AND ts_logged >= DATEADD(millisecond, -${DUPLICATE_SUBMIT_WINDOW_MS}, GETDATE())
          ORDER BY ts_logged DESC`);

      if (dup.recordset.length > 0) {
        await tx.commit();
        return { id: dup.recordset[0].id };
      }

      const req = new sql.Request(tx)
        .input('userId', sql.UniqueIdentifier, userId)
        .input('entryDate', sql.Date, input.entry_date)
        .input('foodId', sql.UniqueIdentifier, input.food_id ?? null)
        .input('servingId', sql.UniqueIdentifier, input.serving_id ?? null)
        .input('quantity', sql.Decimal(8, 3), input.quantity)
        .input('qName', sql.NVarChar(255), input.quick_add_name ?? null);
      if (time) req.input('entryTime', sql.VarChar(8), time);
      if (hasTs) req.input('tsLogged', sql.DateTime2, tsLogged);
      // Quick-add macros live in food_entry_nutrients (written by syncEntryNutrients
      // below), not quick_add_* columns — those were dropped in the migration.
      const result = await req.query<{ id: string }>(
        `INSERT INTO food_entries
           (user_id, entry_date, ${time ? 'entry_time, ' : ''}food_id, serving_id, quantity, quick_add_name${hasTs ? ', ts_logged' : ''})
         OUTPUT INSERTED.id
         VALUES (@userId, @entryDate, ${time ? '@entryTime, ' : ''}@foodId, @servingId, @quantity, @qName${hasTs ? ', @tsLogged' : ''})`
      );
      const id = result.recordset[0].id;
      await tx.commit();
      // Reconcile per-entry nutrients: a recipe ⇒ freeze a snapshot (so a later
      // recipe edit can't rewrite this log), a normal food ⇒ clear (read live),
      // a quick-add ⇒ store the entered macros.
      await applyEntryNutrients(pool, id, input.food_id ?? null, {
        kcal: input.quick_add_kcal,
        protein: input.quick_add_protein_g,
        carbs: input.quick_add_carbs_g,
        fat: input.quick_add_fat_g,
      });
      return { id };
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function updateEntry(
  userId: string,
  entryId: string,
  input: Partial<CreateEntryInput>
): Promise<FoodEntry | null> {
  let pool;
  try {
    pool = await getFoodConnection();
    const sets: string[] = [];
    const req = pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('entryId', sql.UniqueIdentifier, entryId);

    if (input.entry_date !== undefined) {
      sets.push('entry_date = @entryDate');
      req.input('entryDate', sql.Date, input.entry_date);
    }
    if (input.entry_time !== undefined && input.entry_time !== null) {
      const time = input.entry_time.length === 5 ? `${input.entry_time}:00` : input.entry_time;
      sets.push('entry_time = @entryTime');
      req.input('entryTime', sql.VarChar(8), time);
    }
    if (input.food_id !== undefined) {
      sets.push('food_id = @foodId');
      req.input('foodId', sql.UniqueIdentifier, input.food_id);
    }
    if (input.serving_id !== undefined) {
      sets.push('serving_id = @servingId');
      req.input('servingId', sql.UniqueIdentifier, input.serving_id);
    }
    if (input.quantity !== undefined) {
      sets.push('quantity = @quantity');
      req.input('quantity', sql.Decimal(8, 3), input.quantity);
    }
    if (input.quick_add_name !== undefined) {
      sets.push('quick_add_name = @qName');
      req.input('qName', sql.NVarChar(255), input.quick_add_name);
    }
    // Quick-add macros are no longer columns — a change to any of them is applied
    // via syncEntryNutrients (food_entry_nutrients), not the UPDATE.
    const macroProvided =
      input.quick_add_kcal !== undefined ||
      input.quick_add_protein_g !== undefined ||
      input.quick_add_carbs_g !== undefined ||
      input.quick_add_fat_g !== undefined;

    if (sets.length > 0) {
      await req.query(
        `UPDATE food_entries SET ${sets.join(', ')} WHERE id = @entryId AND user_id = @userId`
      );
    }
    // A food re-link recomputes the entry's nutrients via applyEntryNutrients
    // (recipe ⇒ re-snapshot, normal food ⇒ clear, quick-add ⇒ macros). A
    // macros-only edit (food link unchanged ⇒ a quick-add) updates them in place.
    // A quantity/time/date edit touches neither branch, so an existing recipe
    // snapshot is preserved and just re-scales at read time — staying frozen.
    if (input.food_id !== undefined) {
      await applyEntryNutrients(pool, entryId, input.food_id, {
        kcal: input.quick_add_kcal,
        protein: input.quick_add_protein_g,
        carbs: input.quick_add_carbs_g,
        fat: input.quick_add_fat_g,
      });
    } else if (macroProvided) {
      await syncEntryNutrients(pool, entryId, {
        macros: {
          kcal: input.quick_add_kcal,
          protein: input.quick_add_protein_g,
          carbs: input.quick_add_carbs_g,
          fat: input.quick_add_fat_g,
        },
      });
    }
    return await getEntry(userId, entryId);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function listRecentFoods(userId: string, limit: number = 20): Promise<string[]> {
  // Returns food_ids of recently-logged foods (no quick-add), ordered by most recent first, deduped
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('lim', sql.Int, limit)
      .query<{ food_id: string }>(
        // JOIN foods + is_archived = 0 so deleted (soft-archived) foods drop out
        // of Recent — otherwise a food you'd logged before keeps surfacing here
        // after deletion, even though it's gone from search/library.
        `SELECT TOP (@lim) x.food_id FROM (
           SELECT food_id, MAX(ts_logged) AS last_used
           FROM food_entries
           WHERE user_id = @userId AND food_id IS NOT NULL
           GROUP BY food_id
         ) x
         JOIN foods f ON f.id = x.food_id AND f.is_archived = 0
         ORDER BY x.last_used DESC`
      );
    return result.recordset.map((r) => r.food_id);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// One row per recently-logged food (no quick-add), carrying the serving_id +
// quantity from that food's MOST RECENT entry. Powers the "Latest" picker rows so
// they default to the last amount/unit the user actually logged rather than a
// generic "1 serving". Ordered by recency, newest first, archived foods excluded.
export interface RecentFoodUsage {
  food_id: string;
  last_serving_id: string | null;
  last_quantity: number;
}

// How far back the "Latest" section looks. The picker is meant to surface what the
// user has been eating LATELY, so we bound it to a recent window (one month) rather
// than all-time — otherwise a food last logged months ago lingers in "Latest" simply
// because the user hasn't logged enough distinct foods since to push it off the list.
const RECENT_FOOD_LOOKBACK_DAYS = 30;

export async function listRecentFoodUsage(
  userId: string,
  limit: number = 20,
  lookbackDays: number = RECENT_FOOD_LOOKBACK_DAYS
): Promise<RecentFoodUsage[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('lim', sql.Int, limit)
      .input('lookbackDays', sql.Int, lookbackDays)
      .query<{ food_id: string; serving_id: string | null; quantity: number }>(
        // ROW_NUMBER picks each food's latest entry so we can surface its serving +
        // amount. JOIN foods + is_archived = 0 keeps deleted foods out of Recent.
        // The ts_logged >= cutoff bound limits "Latest" to foods logged within the
        // recent window (GETDATE() matches the column's getdate() default, both UTC).
        `SELECT TOP (@lim) x.food_id, x.serving_id, x.quantity FROM (
           SELECT e.food_id, e.serving_id, e.quantity, e.ts_logged,
                  ROW_NUMBER() OVER (PARTITION BY e.food_id ORDER BY e.ts_logged DESC) AS rn
           FROM food_entries e
           JOIN foods f ON f.id = e.food_id AND f.is_archived = 0
           WHERE e.user_id = @userId AND e.food_id IS NOT NULL
             AND e.ts_logged >= DATEADD(DAY, -@lookbackDays, GETDATE())
         ) x
         WHERE x.rn = 1
         ORDER BY x.ts_logged DESC`
      );
    return result.recordset.map((r) => ({
      food_id: r.food_id,
      last_serving_id: r.serving_id ?? null,
      last_quantity: Number(r.quantity),
    }));
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// How much an entry logged in the EXACT requested hour counts for, relative to one
// logged in the hour either side of it (which counts 1). Above 1 so the asked-for
// hour still decides the order; low enough that a food genuinely eaten across the
// whole band isn't buried by one that happens to land on the hour.
const FREQUENT_EXACT_HOUR_WEIGHT = 2;

// Foods the user most often logs AROUND a given hour-of-day — the picker's
// "Frequent now" suggestions. `hour` is the user's local clock hour (0-23, from
// the client) and we match entries whose entry_time falls in that hour OR EITHER
// NEIGHBOURING HOUR (h-1 .. h+1, wrapping at midnight), so e.g. an 8am open
// surfaces the usual 8-o'clock breakfast items.
//
// The neighbours matter: a real meal drifts either side of the clock hour, and an
// exact-hour bucket splits it in half. Noon was the worst case — the same lunch
// logged at 11:55 one day and 12:20 the next counted as ONE hit in each bucket,
// never the >= 2 needed to be "frequent", so the section came up EMPTY at 12PM
// while showing plenty at 3PM. Widening the band keeps the "genuinely repeated,
// not a one-off" bar (still HAVING >= 2) without demanding the user eat on the hour.
//
// Ranked by a weighted score rather than a raw count, so the band never outvotes the
// hour the user actually asked for: an entry in the exact hour is worth HOUR_WEIGHT,
// one in a neighbouring hour is worth 1. Recency breaks ties. Only entries within
// the last `historyDays` (the user-configurable favorites window, default 30) count,
// so a food logged at this hour months ago drops off. Each row carries that food's
// MOST RECENT serving + amount (same shape/semantics as RecentFoodUsage) so a re-add
// reuses what the user actually ate, not "1 serving".
export async function listHourlyFrequentFoodUsage(
  userId: string,
  hour: number,
  limit: number = 8,
  historyDays: number = 30
): Promise<RecentFoodUsage[]> {
  let pool;
  try {
    // Normalise to a single 0-23 clock hour, then take the hour either side of it —
    // wrapping, so 0 pulls in 23 and 23 pulls in 0.
    const h = ((Math.trunc(hour) % 24) + 24) % 24;
    const hPrev = (h + 23) % 24;
    const hNext = (h + 1) % 24;
    // Only count entries logged within the configured history window (days). Floor at
    // 1 so a bad value can't disable the cutoff entirely.
    const days = Number.isFinite(historyDays) ? Math.max(1, Math.round(historyDays)) : 30;
    pool = await getFoodConnection();
    // freq = every food the user logs >= 2x in this hour band within the history
    // window, each with its weighted score and most-recent serving + amount. No TOP here:
    // we first fold recipe-component foods into their parent recipe (below) so the
    // recipe — not its loose ingredients — claims the slot, THEN apply the limit.
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('hCur', sql.Int, h)
      .input('hPrev', sql.Int, hPrev)
      .input('hNext', sql.Int, hNext)
      .input('hourWeight', sql.Int, FREQUENT_EXACT_HOUR_WEIGHT)
      .input('days', sql.Int, days)
      .query<{ food_id: string; serving_id: string | null; quantity: number; score: number }>(
        // freq = entry counts within the hour band per food (>= 2 to be "frequent"),
        // limited to entries whose diary date is within the history window so a food
        // you ate at this hour months ago drops off. `score` weights the exact hour
        // above its neighbours so the band broadens the pool without reordering it.
        // latest = that food's most recent entry, for the serving + amount default.
        `SELECT freq.food_id, latest.serving_id, latest.quantity, freq.score FROM (
           SELECT e.food_id,
                  SUM(CASE WHEN DATEPART(HOUR, e.entry_time) = @hCur THEN @hourWeight ELSE 1 END) AS score,
                  MAX(e.ts_logged) AS last_logged
           FROM food_entries e
           JOIN foods f ON f.id = e.food_id AND f.is_archived = 0
           WHERE e.user_id = @userId AND e.food_id IS NOT NULL AND e.entry_time IS NOT NULL
             AND DATEPART(HOUR, e.entry_time) IN (@hPrev, @hCur, @hNext)
             AND e.entry_date >= DATEADD(DAY, -@days, CAST(GETDATE() AS DATE))
           GROUP BY e.food_id
           HAVING COUNT(*) >= 2
         ) freq
         JOIN (
           SELECT food_id, serving_id, quantity,
                  ROW_NUMBER() OVER (PARTITION BY food_id ORDER BY ts_logged DESC) AS rn
           FROM food_entries
           WHERE user_id = @userId AND food_id IS NOT NULL
         ) latest ON latest.food_id = freq.food_id AND latest.rn = 1
         ORDER BY freq.score DESC, freq.last_logged DESC`
      );
    // Pre-sorted by score DESC, last_logged DESC. Carry the score so we can re-rank
    // after folding recipe components in; the stable sort below preserves this tie-order.
    const rows = result.recordset.map((r) => ({
      food_id: r.food_id,
      last_serving_id: r.serving_id ?? null,
      last_quantity: Number(r.quantity),
      score: Number(r.score),
    }));

    // Map each of the user's active recipes to its resolved ingredient food_ids so we
    // can suppress those ingredients in favour of the recipe ("don't show banana,
    // peanut butter, bread as frequent breakfast items — show the sandwich recipe").
    const ingredientsResult = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query<{ recipe_food_id: string; ingredient_food_id: string }>(
        `SELECT ri.recipe_food_id, ri.ingredient_food_id
         FROM forage_recipe_ingredients ri
         JOIN foods rf ON rf.id = ri.recipe_food_id AND rf.source = 'recipe' AND rf.is_archived = 0
         WHERE rf.user_id = @userId AND ri.ingredient_food_id IS NOT NULL`
      );

    // Only act on recipes that are THEMSELVES frequent in this band — that's the
    // signal the user logs them here, so their loose components are "logged via a
    // recipe". This never strips a standalone staple that has no frequent recipe.
    const freqScores = new Map(rows.map((r) => [r.food_id, r.score]));
    const componentToRecipes = new Map<string, string[]>(); // ingredient food_id -> frequent recipe food_ids
    for (const { recipe_food_id, ingredient_food_id } of ingredientsResult.recordset) {
      if (!freqScores.has(recipe_food_id)) continue; // recipe isn't frequent here — leave its parts alone
      const list = componentToRecipes.get(ingredient_food_id) ?? [];
      list.push(recipe_food_id);
      componentToRecipes.set(ingredient_food_id, list);
    }

    // Suppress each frequent component and let its parent recipe inherit the
    // component's prominence (the user thinks of "my morning banana" AS the sandwich),
    // so the recipe ranks where the loudest component would have. Effective scores start
    // at each food's own score; a recipe is promoted to the max over its covered parts.
    const effectiveScores = new Map(rows.map((r) => [r.food_id, r.score]));
    const suppressed = new Set<string>();
    for (const [componentId, parentRecipeIds] of componentToRecipes) {
      const componentScore = freqScores.get(componentId);
      if (componentScore === undefined) continue; // component isn't itself frequent
      for (const recipeId of parentRecipeIds) {
        if (recipeId === componentId) continue; // never suppress a recipe in favour of itself
        suppressed.add(componentId);
        effectiveScores.set(recipeId, Math.max(effectiveScores.get(recipeId) ?? 0, componentScore));
      }
    }

    return rows
      .filter((r) => !suppressed.has(r.food_id))
      // Stable sort on effective scores keeps the SQL last_logged tie-break for equals.
      .sort((a, b) => effectiveScores.get(b.food_id)! - effectiveScores.get(a.food_id)!)
      .slice(0, limit)
      .map((r) => ({
        food_id: r.food_id,
        last_serving_id: r.last_serving_id,
        last_quantity: r.last_quantity,
      }));
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// How close in the day two entries must be logged to count as ACTUALLY eaten
// together rather than merely on the same date. A diary day is far too coarse a
// bucket for this — an all-day staple like water shares its date with everything
// the user ate, so a same-day count ranks "most-logged food" instead of "usual
// companion". A meal-sized window is what makes the count a real pairing.
const PAIR_WINDOW_MINUTES = 90;

// Foods the user frequently logs TOGETHER WITH `foodId` — its common pairings
// ("frequently paired with"). Ranked by the actual pair count: how many distinct
// days the two were logged within PAIR_WINDOW_MINUTES of each other, so the things
// genuinely eaten alongside the anchor outrank the things that merely share its
// date. Partners that only ever co-occur same-day still appear, but below every
// real pairing. Each row also carries the partner food's own last-logged serving +
// amount (same shape as RecentFoodUsage) so a re-add reuses what the user actually
// ate, not "1 serving".
export async function listPairedFoodUsage(
  userId: string,
  foodId: string,
  limit: number = 10
): Promise<RecentFoodUsage[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('foodId', sql.UniqueIdentifier, foodId)
      .input('window', sql.Int, PAIR_WINDOW_MINUTES)
      .input('lim', sql.Int, limit)
      .query<{ food_id: string; serving_id: string | null; quantity: number }>(
        // anchor = every entry of the anchor food, kept at entry granularity (not
        // folded to dates) so each partner can be measured against the clock time
        // the anchor was actually logged. paired = every OTHER live food logged on
        // one of those days, counted three ways: together_days / together_hits
        // (within the window of some anchor entry) and pair_days (same date at any
        // hour, the fallback tier). latest = each partner's most-recent entry for
        // its serving/amount seed. JOIN foods + is_archived = 0 drops deleted foods.
        `WITH anchor AS (
           SELECT entry_date, entry_time
           FROM food_entries
           WHERE user_id = @userId AND food_id = @foodId
         ),
         paired AS (
           SELECT e.food_id,
                  COUNT(DISTINCT CASE WHEN ABS(DATEDIFF(MINUTE, a.entry_time, e.entry_time)) <= @window
                                      THEN e.entry_date END) AS together_days,
                  COUNT(DISTINCT CASE WHEN ABS(DATEDIFF(MINUTE, a.entry_time, e.entry_time)) <= @window
                                      THEN e.id END) AS together_hits,
                  COUNT(DISTINCT e.entry_date) AS pair_days,
                  MAX(e.ts_logged) AS last_logged
           FROM anchor a
           JOIN food_entries e ON e.user_id = @userId
                              AND e.entry_date = a.entry_date
                              AND e.food_id IS NOT NULL
                              AND e.food_id <> @foodId
           JOIN foods f ON f.id = e.food_id AND f.is_archived = 0
           GROUP BY e.food_id
         ),
         latest AS (
           SELECT e.food_id, e.serving_id, e.quantity,
                  ROW_NUMBER() OVER (PARTITION BY e.food_id ORDER BY e.ts_logged DESC) AS rn
           FROM food_entries e
           WHERE e.user_id = @userId AND e.food_id IS NOT NULL
         )
         SELECT TOP (@lim) p.food_id, l.serving_id, l.quantity
         FROM paired p
         JOIN latest l ON l.food_id = p.food_id AND l.rn = 1
         ORDER BY p.together_days DESC, p.together_hits DESC, p.pair_days DESC, p.last_logged DESC, p.food_id`
      );
    return result.recordset.map((r) => ({
      food_id: r.food_id,
      last_serving_id: r.serving_id ?? null,
      last_quantity: Number(r.quantity),
    }));
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function listActiveDates(userId: string, sinceDate: string): Promise<string[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('since', sql.Date, sinceDate)
      .query<any>(
        `SELECT DISTINCT CONVERT(varchar(10), entry_date, 23) AS entry_date
         FROM food_entries
         WHERE user_id=@userId AND entry_date >= @since
         ORDER BY entry_date`
      );
    return result.recordset.map((r) => r.entry_date);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function deleteEntry(userId: string, entryId: string): Promise<void> {
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('entryId', sql.UniqueIdentifier, entryId)
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`DELETE FROM food_entries WHERE id=@entryId AND user_id=@userId`);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Per-logged-day average nutrient intake across an inclusive [startDate, endDate]
// window. Powers the nutrition overview's date-range view: a "typical logged day"
// over the range, comparable against the daily targets. Returns the same shape as
// computeTotals (macros in dedicated fields, everything keyed by code in micros)
// plus the divisor used (loggedDays = distinct days with ≥1 entry).
//
// Mirrors loadEntryMicros' two-source scaling — food-backed entries scale
// food_nutrients by the serving count (quantity / units_per_serving, serving-less
// ⇒ quantity); foodless quick-adds scale food_entry_nutrients by quantity — but
// as a single grouped aggregate rather than per entry, so a year-long range is two
// queries, not hundreds.
export interface RangeTotals {
  totals: DailyTotals;
  loggedDays: number;
}

export async function getRangeTotals(userId: string, startDate: string, endDate: string): Promise<RangeTotals> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('start', sql.Date, startDate)
      .input('end', sql.Date, endDate)
      .query<{ code: string; total: number }>(
        // Food-backed entries WITHOUT a per-entry snapshot: scale each food_nutrient
        // by the entry's serving count (serving-less ⇒ the raw quantity, matching
        // loadEntryMicros). The NOT EXISTS keeps frozen recipe logs out of this half
        // — they're summed from their snapshot rows below instead.
        `SELECT n.code, SUM(fn.amount * CASE WHEN s.units_per_serving > 0
                                              THEN e.quantity / s.units_per_serving
                                              ELSE e.quantity END) AS total
         FROM food_entries e
         JOIN food_nutrients fn ON fn.food_id = e.food_id
         JOIN nutrients n ON n.id = fn.nutrient_id AND n.is_active = 1
         LEFT JOIN food_servings s ON s.id = e.serving_id
         WHERE e.user_id = @userId AND e.food_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM food_entry_nutrients fx WHERE fx.entry_id = e.id)
           AND e.entry_date >= @start AND e.entry_date <= @end
         GROUP BY n.code
         UNION ALL
         -- Per-entry snapshot rows: foodless quick-adds AND frozen recipe logs.
         -- Scale by serving count too (serving-less ⇒ the raw quantity), so a
         -- recipe's canonical 'serving' (ups=1) scales by quantity like a quick-add.
         SELECT n.code, SUM(fen.amount * CASE WHEN s.units_per_serving > 0
                                               THEN e.quantity / s.units_per_serving
                                               ELSE e.quantity END) AS total
         FROM food_entries e
         JOIN food_entry_nutrients fen ON fen.entry_id = e.id
         JOIN nutrients n ON n.id = fen.nutrient_id AND n.is_active = 1
         LEFT JOIN food_servings s ON s.id = e.serving_id
         WHERE e.user_id = @userId
           AND e.entry_date >= @start AND e.entry_date <= @end
         GROUP BY n.code`
      );

    // Distinct logged days = the averaging divisor (a typical *logged* day, so an
    // un-logged day doesn't dilute the average toward zero).
    const daysResult = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('start', sql.Date, startDate)
      .input('end', sql.Date, endDate)
      .query<{ days: number }>(
        `SELECT COUNT(DISTINCT entry_date) AS days
         FROM food_entries
         WHERE user_id = @userId AND entry_date >= @start AND entry_date <= @end`
      );
    const loggedDays = Number(daysResult.recordset[0]?.days ?? 0);

    // Collapse the UNION's per-source rows by code (a code can appear from both the
    // food-backed and quick-add halves), then divide by the logged-day count.
    const summed = new Map<string, number>();
    for (const r of result.recordset) {
      summed.set(r.code, (summed.get(r.code) ?? 0) + Number(r.total));
    }
    const totals: DailyTotals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, micros: {} };
    if (loggedDays > 0) {
      for (const [code, sum] of summed) {
        const avg = sum / loggedDays;
        const field = MACRO_CODE_TO_FIELD[code];
        if (field) totals[field] = round1(avg);  // macros into their dedicated fields (1 dp)
        totals.micros[code] = round2(avg);        // every code (incl. macros) into micros (2 dp)
      }
    }
    return { totals, loggedDays };
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// One logged day's intake of a single nutrient over a range — powers the
// per-nutrient detail page's daily-intake trend chart. Returns ascending by date,
// one row per day the user logged ANY amount of this nutrient (days with no
// recorded intake of it are simply absent — they read as gaps in the chart, not
// fabricated zeros). Mirrors getRangeTotals' two-source scaling but filtered to a
// single code and grouped by entry_date instead of code.
export async function getNutrientDailySeries(
  userId: string,
  code: string,
  startDate: string,
  endDate: string,
): Promise<NutrientDailyPoint[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('code', sql.NVarChar, code)
      .input('start', sql.Date, startDate)
      .input('end', sql.Date, endDate)
      .query<{ date: string; value: number }>(
        // Sum both sources per day, with the per-entry snapshot taking precedence:
        // food-backed entries WITHOUT a snapshot scale food_nutrients by the serving
        // count (serving-less ⇒ raw quantity); snapshot rows (quick-adds AND frozen
        // recipe logs) scale food_entry_nutrients the same way. Collapse by day.
        `SELECT CONVERT(varchar(10), d.entry_date, 23) AS date, SUM(d.amount) AS value
         FROM (
           SELECT e.entry_date,
                  fn.amount * CASE WHEN s.units_per_serving > 0
                                   THEN e.quantity / s.units_per_serving
                                   ELSE e.quantity END AS amount
           FROM food_entries e
           JOIN food_nutrients fn ON fn.food_id = e.food_id
           JOIN nutrients n ON n.id = fn.nutrient_id AND n.is_active = 1
           LEFT JOIN food_servings s ON s.id = e.serving_id
           WHERE e.user_id = @userId AND e.food_id IS NOT NULL AND n.code = @code
             AND NOT EXISTS (SELECT 1 FROM food_entry_nutrients fx WHERE fx.entry_id = e.id)
             AND e.entry_date >= @start AND e.entry_date <= @end
           UNION ALL
           SELECT e.entry_date,
                  fen.amount * CASE WHEN s.units_per_serving > 0
                                    THEN e.quantity / s.units_per_serving
                                    ELSE e.quantity END AS amount
           FROM food_entries e
           JOIN food_entry_nutrients fen ON fen.entry_id = e.id
           JOIN nutrients n ON n.id = fen.nutrient_id AND n.is_active = 1
           LEFT JOIN food_servings s ON s.id = e.serving_id
           WHERE e.user_id = @userId AND n.code = @code
             AND e.entry_date >= @start AND e.entry_date <= @end
         ) d
         GROUP BY d.entry_date
         ORDER BY d.entry_date`
      );
    return result.recordset.map((r) => ({ date: r.date, value: round2(Number(r.value)) }));
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export function computeTotals(entries: FoodEntry[]): DailyTotals {
  const totals: DailyTotals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, micros: {} };
  for (const e of entries) {
    totals.kcal += e.kcal;
    totals.protein_g += e.protein_g;
    totals.carbs_g += e.carbs_g;
    totals.fat_g += e.fat_g;
    if (e.micros) {
      for (const code in e.micros) {
        totals.micros[code] = (totals.micros[code] ?? 0) + e.micros[code];
      }
    }
  }
  for (const code in totals.micros) {
    totals.micros[code] = round2(totals.micros[code]);
  }
  return totals;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
