import sql from 'mssql';

const config: sql.config = {
  server: process.env.SQL_SERVER_URL!,
  user: process.env.SQL_SERVER_USER!,
  password: process.env.SQL_SERVER_PASSWORD!,
  database: process.env.SQL_GOLEM_DB!,
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

export async function getGolemConnection(): Promise<sql.ConnectionPool> {
  if (!pool || !pool.connected) {
    pool = new sql.ConnectionPool(config);
    await pool.connect();
  }
  return pool;
}

export async function closeGolemConnection(_pool: sql.ConnectionPool): Promise<void> {
  // No-op — singleton pool stays open for reuse
}
