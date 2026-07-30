import { getFoodConnection, closeFoodConnection } from './db';

export interface FoodUnit {
  id: string;
  name: string;
  display_order: number;
}

export async function listUnits(): Promise<FoodUnit[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .query<any>(
        `SELECT id, name, display_order
         FROM food_units
         ORDER BY display_order ASC, name ASC`
      );
    if (result.recordset.length === 0) {
      console.warn(`No units found in food_units`);
    }
    return result.recordset.map((r) => ({
      id: r.id,
      name: r.name,
      display_order: Number(r.display_order),
    }));
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}
