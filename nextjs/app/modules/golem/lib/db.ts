import sql from 'mssql';
import { ensureSecretEnv } from '@/lib/secretCache';

// Build the connection config from the CURRENT environment. Read lazily at connect time
// (not at module eval) so a process.env that was clobbered by a hot-reload and then
// re-hydrated by ensureSecretEnv() is reflected, rather than frozen empty at import.
function buildConfig(): sql.config {
  return {
    server: process.env.SQL_SERVER_URL!,
    user: process.env.SQL_SERVER_USER!,
    password: process.env.SQL_SERVER_PASSWORD!,
    database: process.env.SQL_GOLEM_DB!,
    connectionTimeout: 30000, // 30s to establish connection
    requestTimeout: 60000, // 60s per query (Express runs serially, needs more headroom)
    options: {
      encrypt: true,
      trustServerCertificate: true,
    },
    pool: {
      max: 15,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
}

let pool: sql.ConnectionPool | null = null;
let connectingPromise: Promise<sql.ConnectionPool> | null = null;

export async function getGolemConnection(): Promise<sql.ConnectionPool> {
  // Re-hydrate any secret env dropped by a dev hot-reload before we read it into config.
  ensureSecretEnv();

  if (pool?.connected) {
    return pool;
  }
  if (!connectingPromise) {
    connectingPromise = (async () => {
      try {
        pool = new sql.ConnectionPool(buildConfig());
        await pool.connect();
        return pool;
      } catch (error) {
        // Drop the failed pool so the next call rebuilds config from a fresh env.
        pool = null;
        throw error;
      } finally {
        connectingPromise = null;
      }
    })();
  }
  return connectingPromise;
}

export async function closeGolemConnection(_pool: sql.ConnectionPool): Promise<void> {
  // No-op — singleton pool stays open for reuse
}
