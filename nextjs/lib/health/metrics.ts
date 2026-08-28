import { getHealthConnection } from './db';
import { HealthMetric } from '@/types/health';

// The catalog is small (tens of rows) and effectively static, so it is cached
// on globalThis for the life of the process — it survives `next dev` module
// re-evaluation the same way the secret cache does.
const globalForMetrics = globalThis as unknown as {
  __grimoireHealthMetrics?: Map<string, HealthMetric>;
};

function mapMetric(row: Record<string, unknown>): HealthMetric {
  return {
    code: row.code as string,
    display_name: row.display_name as string,
    category: row.category as HealthMetric['category'],
    canonical_unit: row.canonical_unit as string,
    aggregation: row.aggregation as HealthMetric['aggregation'],
    health_connect_type: (row.health_connect_type as string) ?? null,
    health_connect_field: (row.health_connect_field as string) ?? null,
    is_interval: !!row.is_interval,
    sort_order: row.sort_order as number,
    is_active: !!row.is_active,
  };
}

// Load (and memoize) the whole metric catalog keyed by code.
export async function getMetricCatalog(): Promise<Map<string, HealthMetric>> {
  if (globalForMetrics.__grimoireHealthMetrics) {
    return globalForMetrics.__grimoireHealthMetrics;
  }
  const pool = await getHealthConnection();
  const result = await pool.request().query(`
    SELECT code, display_name, category, canonical_unit, aggregation,
           health_connect_type, health_connect_field, is_interval, sort_order, is_active
    FROM health_metric
    ORDER BY sort_order, code
  `);
  if (result.recordset.length === 0) {
    console.warn('health_metric catalog is empty — run sql/migrations/2026-08-27_health_master_db.sql');
  }
  const catalog = new Map<string, HealthMetric>();
  for (const row of result.recordset) {
    const metric = mapMetric(row);
    catalog.set(metric.code, metric);
  }
  globalForMetrics.__grimoireHealthMetrics = catalog;
  return catalog;
}

// Active metrics in display order.
export async function listMetrics(): Promise<HealthMetric[]> {
  const catalog = await getMetricCatalog();
  return [...catalog.values()]
    .filter((m) => m.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
}

// Throws on an unknown code — a write against a metric that isn't in the
// catalog is a programming error, not a user error (Lib error contract).
export async function requireMetric(code: string): Promise<HealthMetric> {
  const catalog = await getMetricCatalog();
  const metric = catalog.get(code);
  if (!metric) throw new Error(`Unknown health metric code: '${code}'`);
  return metric;
}

// Drop the memoized catalog. Call after seeding/altering health_metric.
export function invalidateMetricCatalog(): void {
  globalForMetrics.__grimoireHealthMetrics = undefined;
}
