import sql from 'mssql';

const config: sql.config = {
  server: process.env.SQL_SERVER_URL!,
  user: process.env.SQL_SERVER_USER!,
  password: process.env.SQL_SERVER_PASSWORD!,
  database: process.env.SQL_MAIN_DB!,
  connectionTimeout: 30000,
  requestTimeout: 60000,
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

let pool: sql.ConnectionPool | null = null;
let connectingPromise: Promise<sql.ConnectionPool> | null = null;

export async function getMainConnection(): Promise<sql.ConnectionPool> {
  if (pool?.connected) {
    return pool;
  }
  if (!connectingPromise) {
    connectingPromise = (async () => {
      pool = new sql.ConnectionPool(config);
      await pool.connect();
      connectingPromise = null;
      return pool;
    })();
  }
  return connectingPromise;
}

export async function closeMainConnection(_pool: sql.ConnectionPool): Promise<void> {
  // No-op — singleton pool stays open for reuse
}
