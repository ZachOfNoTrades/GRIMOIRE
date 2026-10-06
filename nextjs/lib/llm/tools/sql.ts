import sql from "mssql";
import type { LlmTool } from "../types";

// READ-ONLY SQL TOOLS for agentic OpenRouter calls — the in-process twin of each
// module's `executeSqlQueryScript.mjs` (which the Claude CLI runs through Bash).
// Same validator, same limits, same guarantee: @userId is bound server-side from the
// authenticated user, the model never supplies it, and the module's validator refuses
// a query that touches a user-owned table without it.

export interface SqlToolOptions {
  userId: string;
  // The module's singleton pool (getGolemConnection / getRuneConnection).
  getPool: () => Promise<sql.ConnectionPool>;
  // The module's shared validator + limits (sql_query_tool/sqlValidation.mjs).
  validate: (query: string) => { valid: boolean; error?: string };
  limits: { QUERY_TIMEOUT_MS: number; MAX_ROWS: number; MAX_RESULT_CHARS: number };
  // One line naming the database for the tool description ("the training database").
  databaseLabel: string;
  // Extra guidance appended to run_sql's description (table lists, scoping rules).
  guidance: string;
}

export function makeSqlTools(opts: SqlToolOptions): LlmTool[] {
  const runSql: LlmTool = {
    name: "run_sql",
    description: `Run one read-only SELECT against ${opts.databaseLabel}. Returns JSON { success, rowCount, truncated, data } or { success: false, error }. Constraints: SELECT only, no semicolons, max ${opts.limits.MAX_ROWS} rows, ${opts.limits.QUERY_TIMEOUT_MS / 1000}-second timeout. The parameter @userId is bound server-side to the current user — reference it as-is, never hardcode a user id. ${opts.guidance}`,
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "A single T-SQL SELECT statement." } },
      required: ["query"],
    },
    execute: async (args) => {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      const check = opts.validate(query);
      if (!check.valid) return JSON.stringify({ success: false, error: check.error });
      try {
        const pool = await opts.getPool();
        const request = pool.request();
        // Per-request timeout: supported by the driver, missing from its typings.
        (request as unknown as { timeout: number }).timeout = opts.limits.QUERY_TIMEOUT_MS;
        request.input("userId", sql.UniqueIdentifier, opts.userId);
        const result = await request.query(query);
        const rowCount = result.recordset.length;
        const rows = result.recordset.slice(0, opts.limits.MAX_ROWS);
        let serialized = JSON.stringify({ success: true, rowCount: Math.min(rowCount, opts.limits.MAX_ROWS), truncated: rowCount > opts.limits.MAX_ROWS, data: rows });
        if (serialized.length > opts.limits.MAX_RESULT_CHARS) {
          serialized = serialized.slice(0, opts.limits.MAX_RESULT_CHARS) + "\n... (truncated)";
        }
        return serialized;
      } catch (error) {
        return JSON.stringify({ success: false, error: error instanceof Error ? error.message.slice(0, 500) : "SQL error" });
      }
    },
  };

  // The live schema, so the model needs no bundled document to write a correct query.
  const readSchema: LlmTool = {
    name: "read_schema",
    description: `List every table and column in ${opts.databaseLabel} (name, type, nullability). Call this before writing a query you are unsure about.`,
    parameters: { type: "object", properties: {} },
    execute: async () => {
      try {
        const pool = await opts.getPool();
        const result = await pool.request().query<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>(
          `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type, IS_NULLABLE AS is_nullable
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = 'dbo'
           ORDER BY TABLE_NAME, ORDINAL_POSITION`
        );
        const byTable = new Map<string, string[]>();
        for (const row of result.recordset) {
          const cols = byTable.get(row.table_name) ?? [];
          cols.push(`${row.column_name} ${row.data_type}${row.is_nullable === "YES" ? " null" : ""}`);
          byTable.set(row.table_name, cols);
        }
        return [...byTable.entries()].map(([table, cols]) => `${table}: ${cols.join(", ")}`).join("\n");
      } catch (error) {
        return JSON.stringify({ success: false, error: error instanceof Error ? error.message.slice(0, 300) : "schema error" });
      }
    },
  };

  return [runSql, readSchema];
}
