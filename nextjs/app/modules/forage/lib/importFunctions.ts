import sql from 'mssql';
import { getFoodConnection, closeFoodConnection } from './db';
import {
  ImportPayload,
  ImportResult,
  ImportWipeCounts,
  ImportInsertCounts,
} from '../types/import';

// Today's date in the SQL Server session's default timezone — used to keep entries
// the user logged today through the wipe phase. Stored as YYYY-MM-DD.
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface DeleteCounts {
  food_entries: number;
  foods: number;
  food_servings: number;
  food_nutrients: number;
  weight_log: number;
  day_notes: number;
  macro_targets: number;
  forage_program: number;
  forage_goal: number;
}

async function wipeSeedData(
  transaction: sql.Transaction,
  userId: string,
  keepDate: string,
): Promise<DeleteCounts> {
  const counts: DeleteCounts = {
    food_entries: 0,
    foods: 0,
    food_servings: 0,
    food_nutrients: 0,
    weight_log: 0,
    day_notes: 0,
    macro_targets: 0,
    forage_program: 0,
    forage_goal: 0,
  };

  // 1. food_entries: keep only today's
  const delEntries = await transaction.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('keepDate', sql.Date, keepDate)
    .query(`DELETE FROM food_entries WHERE user_id=@userId AND entry_date <> @keepDate;
            SELECT @@ROWCOUNT AS n`);
  counts.food_entries = delEntries.recordset[0].n;

  // 2. food_nutrients: rows whose food has no surviving entry reference (and is user-owned)
  const delNutrients = await transaction.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`DELETE fn FROM food_nutrients fn
            JOIN foods f ON f.id = fn.food_id
            WHERE f.user_id = @userId
              AND f.id NOT IN (SELECT DISTINCT food_id FROM food_entries WHERE user_id=@userId AND food_id IS NOT NULL);
            SELECT @@ROWCOUNT AS n`);
  counts.food_nutrients = delNutrients.recordset[0].n;

  // 3. food_servings: same rule
  const delServings = await transaction.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`DELETE fs FROM food_servings fs
            JOIN foods f ON f.id = fs.food_id
            WHERE f.user_id = @userId
              AND f.id NOT IN (SELECT DISTINCT food_id FROM food_entries WHERE user_id=@userId AND food_id IS NOT NULL);
            SELECT @@ROWCOUNT AS n`);
  counts.food_servings = delServings.recordset[0].n;

  // 4. foods: user-owned, not referenced by surviving entries
  const delFoods = await transaction.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`DELETE FROM foods
            WHERE user_id=@userId
              AND id NOT IN (SELECT DISTINCT food_id FROM food_entries WHERE user_id=@userId AND food_id IS NOT NULL);
            SELECT @@ROWCOUNT AS n`);
  counts.foods = delFoods.recordset[0].n;

  // 5. weight_log: keep only today
  const delWeight = await transaction.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('keepDate', sql.Date, keepDate)
    .query(`DELETE FROM weight_log WHERE user_id=@userId AND log_date <> @keepDate;
            SELECT @@ROWCOUNT AS n`);
  counts.weight_log = delWeight.recordset[0].n;

  // 6. day_notes: keep only today
  const delNotes = await transaction.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('keepDate', sql.Date, keepDate)
    .query(`DELETE FROM day_notes WHERE user_id=@userId AND entry_date <> @keepDate;
            SELECT @@ROWCOUNT AS n`);
  counts.day_notes = delNotes.recordset[0].n;

  // 7. macro targets: wipe the user's macro rows in nutrient_targets_v2 (the
  // macro target store; the legacy macro_targets table was dropped in the
  // macro→nutrient migration). Micro scope='micro' rows are program-scoped and
  // left untouched here.
  const delTargets = await transaction.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`DELETE FROM nutrient_targets_v2 WHERE scope='macro' AND user_id=@userId;
            SELECT @@ROWCOUNT AS n`);
  counts.macro_targets = delTargets.recordset[0].n;

  // 8. forage_program: wipe all (no MF equivalent)
  const delProgram = await transaction.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`DELETE FROM forage_program WHERE user_id=@userId;
            SELECT @@ROWCOUNT AS n`);
  counts.forage_program = delProgram.recordset[0].n;

  // 9. forage_goal: wipe all (re-populated from Weight Goals)
  const delGoal = await transaction.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`DELETE FROM forage_goal WHERE user_id=@userId;
            SELECT @@ROWCOUNT AS n`);
  counts.forage_goal = delGoal.recordset[0].n;

  return counts;
}

export async function importMacroFactorData(
  userId: string,
  payload: ImportPayload,
): Promise<ImportResult> {
  let pool: sql.ConnectionPool | undefined;
  try {
    pool = await getFoodConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      const inserted: ImportInsertCounts = {
        foods: 0,
        food_servings: 0,
        food_nutrients: 0,
        food_entries: 0,
        weight_log: 0,
        day_notes: 0,
        macro_targets: 0,
        forage_goal: 0,
      };

      // === Phase 1: wipe seed data (preserve today) ====================
      const wiped = await wipeSeedData(transaction, userId, todayIso());

      // === Phase 2: nutrient code → id map =============================
      const nutResult = await transaction.request()
        .query<{ id: string; code: string }>(`SELECT id, code FROM nutrients`);
      const codeToNutrientId = new Map<string, string>();
      for (const r of nutResult.recordset) {
        codeToNutrientId.set(r.code, r.id);
      }

      // === Phase 3: insert foods + servings + nutrients ================
      // nameLower → { food_id, servingByUnit: Map<unit, serving_id> }
      const foodIndex = new Map<
        string,
        { id: string; servingByUnit: Map<string, string> }
      >();

      // Existing foods (today's survivors): seed the index so entries can reference them.
      const existingFoods = await transaction.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query<{ id: string; name: string }>(
          `SELECT id, name FROM foods WHERE user_id=@userId`
        );
      for (const r of existingFoods.recordset) {
        foodIndex.set(r.name.toLowerCase(), { id: r.id, servingByUnit: new Map() });
      }
      if (existingFoods.recordset.length > 0) {
        const existingServings = await transaction.request()
          .input('userId', sql.UniqueIdentifier, userId)
          .query<{ id: string; food_id: string; unit: string }>(
            `SELECT s.id, s.food_id, s.unit
             FROM food_servings s JOIN foods f ON f.id = s.food_id
             WHERE f.user_id=@userId`
          );
        const idToFood = new Map<string, string>();
        for (const r of existingFoods.recordset) idToFood.set(r.id, r.name.toLowerCase());
        for (const r of existingServings.recordset) {
          const key = idToFood.get(r.food_id);
          if (!key) continue;
          const entry = foodIndex.get(key);
          if (entry) entry.servingByUnit.set(r.unit, r.id);
        }
      }

      for (const food of payload.foods) {
        const key = food.name.toLowerCase();
        if (foodIndex.has(key)) continue; // already exists from today's survivors
        const foodResult = await transaction.request()
          .input('userId', sql.UniqueIdentifier, userId)
          .input('name', sql.NVarChar(200), food.name)
          .input('brand', sql.NVarChar(200), food.brand)
          .input('source', sql.NVarChar(16), food.source)
          // Macros are written below as food_nutrients rows, not foods columns
          // (dropped in the macro→nutrient migration).
          .query<{ id: string }>(`
            INSERT INTO foods (user_id, name, brand, source)
            OUTPUT INSERTED.id
            VALUES (@userId, @name, @brand, @source)
          `);
        const foodId = foodResult.recordset[0].id;
        inserted.foods++;

        const servingByUnit = new Map<string, string>();
        for (const s of food.servings) {
          const sResult = await transaction.request()
            .input('foodId', sql.UniqueIdentifier, foodId)
            .input('unit', sql.NVarChar(32), s.unit)
            .input('ups', sql.Decimal(12, 4), s.units_per_serving)
            .query<{ id: string }>(`
              INSERT INTO food_servings (food_id, unit, units_per_serving)
              OUTPUT INSERTED.id
              VALUES (@foodId, @unit, @ups)
            `);
          servingByUnit.set(s.unit, sResult.recordset[0].id);
          inserted.food_servings++;
        }

        for (const n of food.nutrients) {
          const nutrientId = codeToNutrientId.get(n.code);
          if (!nutrientId) continue;
          await transaction.request()
            .input('foodId', sql.UniqueIdentifier, foodId)
            .input('nutrientId', sql.UniqueIdentifier, nutrientId)
            .input('amount', sql.Decimal(12, 4), n.amount)
            .query(`INSERT INTO food_nutrients (food_id, nutrient_id, amount)
                    VALUES (@foodId, @nutrientId, @amount)`);
          inserted.food_nutrients++;
        }

        // Macros are stored as food_nutrients (category='macro' rows) — the sole
        // macro store now. Resolves on every nutrient-keyed surface (detail page
        // / foods-highest / breakdowns) and drives the Food contract's macro fields.
        for (const m of [
          { code: 'kcal', amount: food.kcal_per_serving },
          { code: 'protein', amount: food.protein_g_per_serving },
          { code: 'carbs', amount: food.carbs_g_per_serving },
          { code: 'fat', amount: food.fat_g_per_serving },
        ]) {
          const nutrientId = codeToNutrientId.get(m.code);
          if (!nutrientId || !(Number(m.amount) > 0)) continue;
          await transaction.request()
            .input('foodId', sql.UniqueIdentifier, foodId)
            .input('nutrientId', sql.UniqueIdentifier, nutrientId)
            .input('amount', sql.Decimal(12, 4), m.amount)
            .query(`INSERT INTO food_nutrients (food_id, nutrient_id, amount)
                    VALUES (@foodId, @nutrientId, @amount)`);
          inserted.food_nutrients++;
        }

        foodIndex.set(key, { id: foodId, servingByUnit });
      }

      // === Phase 4: insert food_entries =================================
      for (const e of payload.entries) {
        if (e.food_name === null && e.quick_add !== null) {
          // Quick-add fill row. Macros go to food_entry_nutrients (per-unit),
          // not quick_add_* columns (dropped in the macro→nutrient migration).
          const qaResult = await transaction.request()
            .input('userId', sql.UniqueIdentifier, userId)
            .input('entryDate', sql.Date, e.entry_date)
            .input('entryTime', sql.VarChar(8), e.entry_time)
            .input('quantity', sql.Decimal(8, 3), e.quantity)
            .input('quickName', sql.NVarChar(200), e.quick_add.name)
            .query<{ id: string }>(`
              INSERT INTO food_entries
                (user_id, entry_date, entry_time, quantity, quick_add_name)
              OUTPUT INSERTED.id
              VALUES (@userId, @entryDate, @entryTime, @quantity, @quickName)
            `);
          const qaEntryId = qaResult.recordset[0].id;
          for (const m of [
            { code: 'kcal', amount: e.quick_add.kcal },
            { code: 'protein', amount: e.quick_add.protein_g },
            { code: 'carbs', amount: e.quick_add.carbs_g },
            { code: 'fat', amount: e.quick_add.fat_g },
          ]) {
            const nutrientId = codeToNutrientId.get(m.code);
            if (!nutrientId || !(Number(m.amount) > 0)) continue;
            await transaction.request()
              .input('entryId', sql.UniqueIdentifier, qaEntryId)
              .input('nutrientId', sql.UniqueIdentifier, nutrientId)
              .input('amount', sql.Decimal(12, 4), m.amount)
              .query(`INSERT INTO food_entry_nutrients (entry_id, nutrient_id, amount)
                      VALUES (@entryId, @nutrientId, @amount)`);
          }
          inserted.food_entries++;
          continue;
        }

        if (!e.food_name) continue;
        const food = foodIndex.get(e.food_name.toLowerCase());
        if (!food) {
          throw new Error(`Entry references unknown food: '${e.food_name}'`);
        }
        let servingId: string | null = null;
        if (e.unit) {
          servingId = food.servingByUnit.get(e.unit) ?? null;
          if (!servingId) {
            // Should only happen if the entry has a unit we never saw at food-creation time.
            // Insert a 1:1 serving on the fly.
            const sResult = await transaction.request()
              .input('foodId', sql.UniqueIdentifier, food.id)
              .input('unit', sql.NVarChar(32), e.unit)
              .input('ups', sql.Decimal(12, 4), e.quantity)
              .query<{ id: string }>(`
                INSERT INTO food_servings (food_id, unit, units_per_serving)
                OUTPUT INSERTED.id
                VALUES (@foodId, @unit, @ups)
              `);
            servingId = sResult.recordset[0].id;
            food.servingByUnit.set(e.unit, servingId);
            inserted.food_servings++;
          }
        }

        await transaction.request()
          .input('userId', sql.UniqueIdentifier, userId)
          .input('entryDate', sql.Date, e.entry_date)
          .input('entryTime', sql.VarChar(8), e.entry_time)
          .input('foodId', sql.UniqueIdentifier, food.id)
          .input('servingId', sql.UniqueIdentifier, servingId)
          .input('quantity', sql.Decimal(8, 3), e.quantity)
          .query(`
            INSERT INTO food_entries (user_id, entry_date, entry_time, food_id, serving_id, quantity)
            VALUES (@userId, @entryDate, @entryTime, @foodId, @servingId, @quantity)
          `);
        inserted.food_entries++;
      }

      // === Phase 5: insert weight_log ==================================
      for (const w of payload.weights) {
        await transaction.request()
          .input('userId', sql.UniqueIdentifier, userId)
          .input('logDate', sql.Date, w.log_date)
          .input('weightLb', sql.Decimal(6, 2), w.weight_lb)
          .input('bodyFatPct', sql.Decimal(4, 1), w.body_fat_pct)
          .query(`
            INSERT INTO weight_log (user_id, log_date, weight_lb, body_fat_pct)
            VALUES (@userId, @logDate, @weightLb, @bodyFatPct)
          `);
        inserted.weight_log++;
      }

      // === Phase 6: insert day_notes ===================================
      for (const n of payload.day_notes) {
        await transaction.request()
          .input('userId', sql.UniqueIdentifier, userId)
          .input('entryDate', sql.Date, n.entry_date)
          .input('note', sql.NVarChar(sql.MAX), n.note)
          .query(`
            INSERT INTO day_notes (user_id, entry_date, note)
            VALUES (@userId, @entryDate, @note)
          `);
        inserted.day_notes++;
      }

      // === Phase 7: insert macro_targets — one row per program change ===
      // Sorted chronologically by parser; only the latest gets is_active=1 so
      // current-target lookups (no date) still return the right row, while
      // date-scoped lookups can walk effective_date.
      for (let i = 0; i < payload.program_history.length; i++) {
        const p = payload.program_history[i];
        const isActive = i === payload.program_history.length - 1 ? 1 : 0;
        await transaction.request()
          .input('userId', sql.UniqueIdentifier, userId)
          .input('effectiveDate', sql.Date, p.effective_date)
          .input('kcal', sql.Int, p.kcal)
          .input('protein', sql.Int, p.protein_g)
          .input('carbs', sql.Int, p.carbs_g)
          .input('fat', sql.Int, p.fat_g)
          .input('isActive', sql.Bit, isActive)
          .input('source', sql.VarChar(16), 'program')
          .query(`
            -- Macro target history lives in nutrient_targets_v2 (scope='macro') —
            -- 4 rows (kcal/protein/fat/carbs) sharing identity, skipping zero
            -- values; this is the read source for getActiveTarget. One updated_at
            -- per group keeps same-date groups distinguishable. (The legacy
            -- macro_targets table was dropped in the macro→nutrient migration.)
            DECLARE @now DATETIME2 = SYSUTCDATETIME();
            ;WITH macro_ids AS (SELECT code, id FROM nutrients WHERE category='macro')
            INSERT INTO nutrient_targets_v2
              (scope, user_id, program_id, nutrient_id, floor, target, ceiling,
               effective_date, day_of_week, is_active, source, updated_at)
            SELECT 'macro', @userId, NULL, mi.id, NULL, v.val, NULL,
                   @effectiveDate, NULL, @isActive, @source, @now
            FROM (VALUES ('kcal',@kcal),('protein',@protein),('fat',@fat),('carbs',@carbs)) AS v(code,val)
            JOIN macro_ids mi ON mi.code = v.code
            WHERE v.val <> 0;
          `);
        inserted.macro_targets++;
      }

      // === Phase 8: insert forage_goal — full history ===================
      for (const g of payload.goals) {
        await transaction.request()
          .input('userId', sql.UniqueIdentifier, userId)
          .input('goalKind', sql.VarChar(16), g.goal_kind)
          .input('rate', sql.Decimal(4, 2), g.rate_lb_per_week)
          .input('targetWeight', sql.Decimal(6, 2), g.target_weight_lb)
          .input('startedAt', sql.DateTime2, new Date(g.started_at))
          .input('endedAt', sql.DateTime2, g.ended_at ? new Date(g.ended_at) : null)
          .query(`
            INSERT INTO forage_goal
              (user_id, goal_kind, rate_lb_per_week, target_weight_lb, created_at, ended_at)
            VALUES (@userId, @goalKind, @rate, @targetWeight, @startedAt, @endedAt)
          `);
        inserted.forage_goal++;
      }

      await transaction.commit();

      return { wiped, inserted };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error importing MacroFactor data:', error);
    throw error;
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}
