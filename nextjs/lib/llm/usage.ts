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

// HISTORY FOR ESTIMATES — what a task has cost so far, across all users (token counts
// and timings only; never content). The settings page turns this into a per-model
// "~$cost | seconds" estimate: average prompt/completion tokens for the task × the
// model's list price, and the average duration of past calls on that model.
export interface TaskTokenStats {
  calls: number;
  promptTokensAvg: number;
  completionTokensAvg: number;
}

export interface ModelTimingStats {
  calls: number;
  durationMsAvg: number;
  costUsdAvg: number | null;
}

// Per backend: a CLI call carries ~28K tokens of agent system prompt that an
// OpenRouter call never sends, so the two must not be averaged together.
export async function getTaskTokenStats(task: string, backend: LlmBackend): Promise<TaskTokenStats> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("task", sql.NVarChar(40), task)
    .input("backend", sql.NVarChar(16), backend)
    .query<{ calls: number; p: number | null; c: number | null }>(
      `SELECT COUNT(*) AS calls, AVG(CAST(prompt_tokens AS FLOAT)) AS p, AVG(CAST(completion_tokens AS FLOAT)) AS c
       FROM llm_usage
       WHERE task = @task AND backend = @backend AND ok = 1 AND prompt_tokens > 0`
    );
  const row = result.recordset[0];
  return { calls: row?.calls ?? 0, promptTokensAvg: row?.p ?? 0, completionTokensAvg: row?.c ?? 0 };
}

// Per model id (the id OpenRouter or the CLI reported), for one task and backend.
export async function getModelTimingStats(task: string, backend: LlmBackend): Promise<Map<string, ModelTimingStats>> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("task", sql.NVarChar(40), task)
    .input("backend", sql.NVarChar(16), backend)
    .query<{ model: string; calls: number; d: number; cost: number | null }>(
      `SELECT model, COUNT(*) AS calls, AVG(CAST(duration_ms AS FLOAT)) AS d, AVG(cost_usd) AS cost
       FROM llm_usage
       WHERE task = @task AND backend = @backend AND ok = 1
       GROUP BY model`
    );
  const out = new Map<string, ModelTimingStats>();
  for (const r of result.recordset) out.set(r.model, { calls: r.calls, durationMsAvg: r.d, costUsdAvg: r.cost === null ? null : Number(r.cost) });
  return out;
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
  // Mean wall-clock per successful call, in ms; null when nothing succeeded.
  durationMsAvg: number | null;
}

export interface UsageReport {
  range: UsageRange;
  summary: UsageTotals & { byBackend: Record<LlmBackend, UsageTotals> };
  byTask: (UsageTotals & { task: string; backend: LlmBackend; model: string })[];
  byModel: (UsageTotals & { backend: LlmBackend; model: string })[];
  daily: (UsageTotals & { day: string })[];
}

const EMPTY: UsageTotals = { calls: 0, failed: 0, promptTokens: 0, completionTokens: 0, costUsd: 0, durationMsAvg: null };

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
  duration_ms_avg: number | null;
}

function totals(r: TotalsRecord): UsageTotals {
  return {
    calls: r.calls,
    failed: r.failed,
    promptTokens: r.prompt_tokens ?? 0,
    completionTokens: r.completion_tokens ?? 0,
    costUsd: Number(r.cost_usd ?? 0),
    durationMsAvg: r.duration_ms_avg === null ? null : Number(r.duration_ms_avg),
  };
}

// Timing is averaged over successful calls only — a failed call's duration is how
// long it took to fail, which says nothing about the model.
const TOTALS_SELECT = `
  COUNT(*) AS calls,
  SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed,
  SUM(prompt_tokens) AS prompt_tokens,
  SUM(completion_tokens) AS completion_tokens,
  SUM(cost_usd) AS cost_usd,
  AVG(CASE WHEN ok = 1 THEN CAST(duration_ms AS FLOAT) END) AS duration_ms_avg`;

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
  // The overall mean time is weighted by each backend's successful-call count.
  let timedCalls = 0;
  let timedMs = 0;
  for (const r of byBackend.recordset) {
    const t = totals(r);
    perBackend[r.backend] = t;
    summary.calls += t.calls;
    summary.failed += t.failed;
    summary.promptTokens += t.promptTokens;
    summary.completionTokens += t.completionTokens;
    summary.costUsd += t.costUsd;
    if (t.durationMsAvg !== null) {
      const ok = t.calls - t.failed;
      timedCalls += ok;
      timedMs += t.durationMsAvg * ok;
    }
  }
  summary.durationMsAvg = timedCalls > 0 ? timedMs / timedCalls : null;

  return {
    range,
    summary: { ...summary, byBackend: perBackend },
    byTask: byTask.recordset.map((r) => ({ ...totals(r), task: r.task, backend: r.backend, model: r.model })),
    byModel: byModel.recordset.map((r) => ({ ...totals(r), backend: r.backend, model: r.model })),
    daily: daily.recordset.map((r) => ({ ...totals(r), day: new Date(r.day).toISOString().slice(0, 10) })),
  };
}
