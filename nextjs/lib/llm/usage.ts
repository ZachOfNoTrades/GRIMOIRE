import sql from "mssql";
import { getMainConnection } from "@/lib/db";
import type { LlmBackend } from "./types";

// LLM USAGE LOG — dbo.llm_usage in the MAIN database. One row per completion (a
// tool-calling loop is one row with its rounds summed). Only counts, costs and
// timings are stored — never a prompt or a reply. Reads are always one user's own.

export interface UsageRow {
  userId: string;
  task: string;
  backend: LlmBackend;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
  durationMs: number;
  ok: boolean;
  errorCode: string | null;
}

// Fire-and-forget: a failed insert is logged and never fails the generation.
export function recordUsage(row: UsageRow): void {
  void (async () => {
    try {
      const pool = await getMainConnection();
      await pool
        .request()
        .input("userId", sql.UniqueIdentifier, row.userId)
        .input("task", sql.NVarChar(40), row.task)
        .input("backend", sql.NVarChar(16), row.backend)
        .input("model", sql.NVarChar(120), row.model.slice(0, 120))
        .input("promptTokens", sql.Int, Math.max(0, Math.round(row.promptTokens)))
        .input("completionTokens", sql.Int, Math.max(0, Math.round(row.completionTokens)))
        .input("costUsd", sql.Decimal(12, 6), row.costUsd)
        .input("durationMs", sql.Int, Math.max(0, Math.round(row.durationMs)))
        .input("ok", sql.Bit, row.ok)
        .input("errorCode", sql.NVarChar(40), row.errorCode)
        .query(
          `INSERT INTO llm_usage (user_id, task, backend, model, prompt_tokens, completion_tokens, cost_usd, duration_ms, ok, error_code)
           VALUES (@userId, @task, @backend, @model, @promptTokens, @completionTokens, @costUsd, @durationMs, @ok, @errorCode)`
        );
    } catch (error) {
      console.warn("[llm] usage row not recorded:", error instanceof Error ? error.message : error);
    }
  })();
}

export type UsageRange = "7d" | "30d" | "all";

export function isUsageRange(value: unknown): value is UsageRange {
  return value === "7d" || value === "30d" || value === "all";
}

export interface UsageTotals {
  calls: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface UsageReport {
  range: UsageRange;
  summary: UsageTotals & { byBackend: Record<LlmBackend, UsageTotals> };
  byTask: (UsageTotals & { task: string; backend: LlmBackend; model: string })[];
  byModel: (UsageTotals & { backend: LlmBackend; model: string })[];
  daily: (UsageTotals & { day: string })[];
}

const EMPTY: UsageTotals = { calls: 0, failed: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 };

function sinceFor(range: UsageRange): Date | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

interface TotalsRecord {
  calls: number;
  failed: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number | null;
}

function totals(r: TotalsRecord): UsageTotals {
  return {
    calls: r.calls,
    failed: r.failed,
    promptTokens: r.prompt_tokens ?? 0,
    completionTokens: r.completion_tokens ?? 0,
    costUsd: Number(r.cost_usd ?? 0),
  };
}

const TOTALS_SELECT = `
  COUNT(*) AS calls,
  SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed,
  SUM(prompt_tokens) AS prompt_tokens,
  SUM(completion_tokens) AS completion_tokens,
  SUM(cost_usd) AS cost_usd`;

export async function getUsageReport(userId: string, range: UsageRange): Promise<UsageReport> {
  const pool = await getMainConnection();
  const since = sinceFor(range);
  const where = since ? "WHERE user_id = @userId AND ts >= @since" : "WHERE user_id = @userId";
  const req = () => {
    const r = pool.request().input("userId", sql.UniqueIdentifier, userId);
    if (since) r.input("since", sql.DateTime2, since);
    return r;
  };

  const [byBackend, byTask, byModel, daily] = await Promise.all([
    req().query<TotalsRecord & { backend: LlmBackend }>(
      `SELECT backend, ${TOTALS_SELECT} FROM llm_usage ${where} GROUP BY backend`
    ),
    req().query<TotalsRecord & { task: string; backend: LlmBackend; model: string }>(
      `SELECT task, backend, model, ${TOTALS_SELECT} FROM llm_usage ${where}
       GROUP BY task, backend, model ORDER BY SUM(cost_usd) DESC, COUNT(*) DESC`
    ),
    req().query<TotalsRecord & { backend: LlmBackend; model: string }>(
      `SELECT backend, model, ${TOTALS_SELECT} FROM llm_usage ${where}
       GROUP BY backend, model ORDER BY SUM(cost_usd) DESC, COUNT(*) DESC`
    ),
    req().query<TotalsRecord & { day: Date }>(
      `SELECT CAST(ts AS DATE) AS day, ${TOTALS_SELECT} FROM llm_usage ${where}
       GROUP BY CAST(ts AS DATE) ORDER BY day`
    ),
  ]);

  const perBackend: Record<LlmBackend, UsageTotals> = { claude: { ...EMPTY }, openrouter: { ...EMPTY } };
  const summary: UsageTotals = { ...EMPTY };
  for (const r of byBackend.recordset) {
    const t = totals(r);
    perBackend[r.backend] = t;
    summary.calls += t.calls;
    summary.failed += t.failed;
    summary.promptTokens += t.promptTokens;
    summary.completionTokens += t.completionTokens;
    summary.costUsd += t.costUsd;
  }

  return {
    range,
    summary: { ...summary, byBackend: perBackend },
    byTask: byTask.recordset.map((r) => ({ ...totals(r), task: r.task, backend: r.backend, model: r.model })),
    byModel: byModel.recordset.map((r) => ({ ...totals(r), backend: r.backend, model: r.model })),
    daily: daily.recordset.map((r) => ({ ...totals(r), day: new Date(r.day).toISOString().slice(0, 10) })),
  };
}
