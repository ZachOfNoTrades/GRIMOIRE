/**
 * Read-only SQL guard for the rune flash-card database. Shared by the CLI script
 * (executeSqlQueryScript.mjs, run by the Claude CLI through Bash) and the in-process
 * `run_sql` tool handed to OpenRouter models (lib/llm/tools/sql.ts), so both paths
 * enforce exactly the same rules — including that user-owned tables are always
 * filtered by the server-bound @userId.
 */

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
export const USER_OWNED_TABLES = [
  'decks', 'cards', 'card_progress', 'card_reviews',
  'collections', 'study_sessions', 'rune_settings',
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
