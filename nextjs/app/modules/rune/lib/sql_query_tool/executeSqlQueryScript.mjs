/**
 * Executes a read-only SQL query against the RUNE database, scoped to a specific user.
 *
 * Usage: node executeSqlQueryScript.mjs "<userId>" "SELECT ..."
 *
 * The query MUST reference @userId for any user-owned table (decks, cards, ...).
 * The actual userId value is injected server-side via a bound parameter —
 * the LLM never controls the UUID directly.
 *
 * The guard lives in sqlValidation.mjs so the in-process `run_sql` tool for OpenRouter
 * models (lib/llm/tools/sql.ts) enforces the exact same rules as this script.
 */

import sql from 'mssql';
import { MAX_RESULT_CHARS, MAX_ROWS, QUERY_TIMEOUT_MS, validateSqlQuery } from './sqlValidation.mjs';

// EXTRACT AND VALIDATE ARGUMENTS

const userId = process.argv[2];
const query = process.argv[3];

if (!userId || userId.trim().length === 0) {
  console.error(JSON.stringify({ success: false, error: 'No userId provided. Usage: node executeSqlQueryScript.mjs "<userId>" "SELECT ..."' }));
  process.exit(1);
}

if (!query || query.trim().length === 0) {
  console.error(JSON.stringify({ success: false, error: 'No SQL query provided. Usage: node executeSqlQueryScript.mjs "<userId>" "SELECT ..."' }));
  process.exit(1);
}

const trimmedQuery = query.trim();

const validation = validateSqlQuery(trimmedQuery);
if (!validation.valid) {
  console.error(JSON.stringify({ success: false, error: validation.error }));
  process.exit(1);
}

// CONNECT TO DATABASE AND EXECUTE WITH BOUND @userId

const config = {
  server: process.env.SQL_SERVER_URL,
  user: process.env.SQL_SERVER_USER,
  password: process.env.SQL_SERVER_PASSWORD,
  database: process.env.SQL_RUNE_DB,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

let pool;
try {
  pool = new sql.ConnectionPool(config);
  await pool.connect();

  const request = pool.request();
  request.timeout = QUERY_TIMEOUT_MS;

  // Bind @userId server-side — the LLM references it but never controls the value
  request.input('userId', sql.UniqueIdentifier, userId);

  const result = await request.query(trimmedQuery);

  // Trim down results by row count, if necessary
  const rows = result.recordset.slice(0, MAX_ROWS);
  const rowCount = result.recordset.length;
  const isTruncated = rowCount > MAX_ROWS;

  // Trim down results by character count, if necessary
  let serialized = JSON.stringify({ success: true, rowCount: Math.min(rowCount, MAX_ROWS), truncated: isTruncated, data: rows }, null, 2);
  if (serialized.length > MAX_RESULT_CHARS) {
    serialized = serialized.substring(0, MAX_RESULT_CHARS) + '\n... (truncated)';
  }

  console.log(serialized);
} catch (error) {
  const message = error?.message || 'Unknown SQL error';
  console.error(JSON.stringify({ success: false, error: message }));
  process.exit(1);
} finally {
  if (pool && pool.connected) {
    await pool.close();
  }
}
