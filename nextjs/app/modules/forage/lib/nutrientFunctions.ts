import { getFoodConnection, closeFoodConnection } from './db';
import { Nutrient, NutrientCategory } from '../types/food';
import { byNutrientOrder } from '../utils/nutrientLedger';

// Module-scoped cache. The nutrient reference set rarely changes; reload on process restart.
let __cache: Nutrient[] | null = null;
let __inflight: Promise<Nutrient[]> | null = null;

export async function listNutrients(): Promise<Nutrient[]> {
  if (__cache) return __cache;
  if (__inflight) return __inflight;
  __inflight = (async () => {
    let pool;
    try {
      pool = await getFoodConnection();
      // The nutrients table is an UNORDERED reference set — render order is owned
      // by the code manifest (nutrientLedger.ts), never the DB. We sort the result
      // by byNutrientOrder here so every consumer inherits canonical order.
      const result = await pool.request().query<any>(
        `SELECT id, code, name, category, unit, daily_value,
                default_floor, default_target, default_ceiling
         FROM nutrients
         WHERE is_active = 1`
      );
      if (result.recordset.length === 0) {
        console.warn(`No nutrients found in nutrients table`);
      }
      const num = (v: unknown) => (v != null ? Number(v) : null);
      const list: Nutrient[] = result.recordset.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        category: r.category as NutrientCategory,
        unit: r.unit,
        daily_value: num(r.daily_value),
        default_floor: num(r.default_floor),
        default_target: num(r.default_target),
        default_ceiling: num(r.default_ceiling),
      })).sort(byNutrientOrder);
      __cache = list;
      return list;
    } finally {
      if (pool) await closeFoodConnection(pool);
      __inflight = null;
    }
  })();
  return __inflight;
}

export async function getNutrientById(id: string): Promise<Nutrient | null> {
  const all = await listNutrients();
  return all.find((n) => n.id === id) ?? null;
}

export async function getNutrientByCode(code: string): Promise<Nutrient | null> {
  const all = await listNutrients();
  return all.find((n) => n.code === code) ?? null;
}
