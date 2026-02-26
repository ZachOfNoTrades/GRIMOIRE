import sql from 'mssql';

const config: sql.config = {
  server: process.env.SQL_SERVER_URL!,
  user: process.env.SQL_SERVER_USER!,
  password: process.env.SQL_SERVER_PASSWORD!,
  database: process.env.SQL_WEST_DB!,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

export async function getWestConnection(): Promise<sql.ConnectionPool> {
  const pool = new sql.ConnectionPool(config);
  await pool.connect();
  return pool;
}

export async function closeWestConnection(pool: sql.ConnectionPool): Promise<void> {
  if (pool && pool.connected) {
    await pool.close();
  }
}
