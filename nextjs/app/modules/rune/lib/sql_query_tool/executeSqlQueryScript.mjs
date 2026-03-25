/**
 * This script takes a 'query' argument and executes it against the RUNE database.
 *
 * Usage: `node executeSqlQueryScript.mjs "SELECT TOP 10 name FROM decks"`
 */

import sql from 'mssql';

export const QUERY_TIMEOUT_MS = 5000;
export const MAX_ROWS = 100;
export const MAX_RESULT_CHARS = 50000;

export const FORBIDDEN_PATTERNS = [
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bDROP\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bTRUNCATE\b/i,
  /\bEXEC\b/i,
  /\bEXECUTE\b/i,
  /\bMERGE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bsp_/i,
  /\bxp_/i,
  /;/,
];

// Validates a query is only a basic SELECT statement
export function validateSqlQuery(sql) {
  const trimmed = sql.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Query is empty' };
  }

  if (!trimmed.toUpperCase().startsWith('SELECT')) {
    return { valid: false, error: 'Only SELECT queries are allowed' };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      const keyword = pattern.source.replace(/\\b/g, '').replace(/\\/g, '');
      return { valid: false, error: `Forbidden keyword detected: ${keyword}` };
    }
  }

  return { valid: true };
}

/**
 * MAIN FUNCTION
 */

// EXTRACT AND VALIDATE QUERY

const query = process.argv[2]; // Extract query from script execution

if (!query || query.trim().length === 0) {
  console.error(JSON.stringify({ success: false, error: 'No SQL query provided. Usage: node executeSqlQueryScript.mjs "SELECT ..."' }));
  process.exit(1);
}

const trimmedQuery = query.trim();

const validation = validateSqlQuery(trimmedQuery);
if (!validation.valid) {
  console.error(JSON.stringify({ success: false, error: validation.error }));
  process.exit(1);
}

// CONNECT TO DATABASE AND EXECUTE

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

  const result = await request.query(trimmedQuery);

  // Trim down results by row count, if necessary
  const rows = result.recordset.slice(0, MAX_ROWS);
  const rowCount = result.recordset.length;
  let isTruncated = rowCount > MAX_ROWS;

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
