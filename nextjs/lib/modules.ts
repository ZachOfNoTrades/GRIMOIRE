import { getMainConnection } from "@/lib/db";
import { Module } from "@/types/module";

export async function getAllModules(): Promise<Module[]> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .query<Module>(
      `SELECT id, name, slug, description, icon, enabled, ts_created, ts_updated
       FROM modules
       WHERE enabled = 1
       ORDER BY name`
    );

  if (result.recordset.length === 0) {
    console.warn("No modules found");
  }

  return result.recordset;
}
