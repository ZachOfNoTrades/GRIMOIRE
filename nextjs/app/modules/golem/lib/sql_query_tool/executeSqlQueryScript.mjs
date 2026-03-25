/**
 * Executes a read-only SQL query scoped to a specific user.
 *
 * Usage: node executeSqlQueryScript.mjs "<userId>" "SELECT ..."
 *
 * The query MUST reference @userId for any user-owned table.
 * The actual userId value is injected server-side via sp_executesql —
 * the LLM never controls the UUID directly.
 *
 * Shared tables (exercises with user_id IS NULL, muscle_groups, exercise_modifiers)
 * can be queried without @userId.
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

// Tables that contain user-owned data and require @userId filtering
const USER_OWNED_TABLES = [
  'programs', 'blocks', 'weeks', 'workout_sessions',
  'session_segments', 'session_segment_sets',
  'target_session_segments', 'target_session_segment_sets',
  'program_templates', 'user_profiles', 'user_exercise_overrides',
];

// Validates a query is only a basic SELECT statement
export function validateSqlQuery(query) {
  const trimmed = query.trim();

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

  // Check if query references user-owned tables without @userId
  const upperQuery = trimmed.toUpperCase();
  const hasUserIdParam = trimmed.includes('@userId');

  for (const table of USER_OWNED_TABLES) {
    if (upperQuery.includes(table.toUpperCase()) && !hasUserIdParam) {
      return { valid: false, error: `Query references user-owned table '${table}' but does not include @userId filter. Add WHERE user_id = @userId to your query.` };
    }
  }

  return { valid: true };
}

/**
 * MAIN FUNCTION
 */

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
  database: process.env.SQL_GOLEM_DB,
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
