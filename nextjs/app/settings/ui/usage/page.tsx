"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import toast, { Toaster } from "@/components/Toaster";
import HelpButton from "@/components/ui/HelpButton";
import Breadcrumbs from "@/components/Breadcrumbs";
import SegmentedToggle, { type SegmentedOption } from "@/components/ui/SegmentedToggle";
import { SettingsControlRow } from "@/components/settings/SettingsList";
import { LLM_TASKS } from "@/lib/llm/tasks";
import type { LlmBackend } from "@/lib/llm/types";

// SETTINGS → AI → USAGE. The signed-in user's own model-call log, aggregated by the
// API: totals, a per-day chart, and breakdowns by task and by model. One range
// control; everything re-fetches on change and nothing paints before the data is in.

type UsageRange = "7d" | "30d" | "all";

interface Totals {
  calls: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  durationMsAvg: number | null;
}

interface UsageReport {
  range: UsageRange;
  summary: Totals & { byBackend: Record<LlmBackend, Totals> };
  byTask: (Totals & { task: string; backend: LlmBackend; model: string })[];
  byModel: (Totals & { backend: LlmBackend; model: string })[];
  daily: (Totals & { day: string })[];
}

const RANGE_OPTIONS: SegmentedOption<UsageRange>[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All" },
];

const TASK_LABEL: Record<string, string> = Object.fromEntries(LLM_TASKS.map((t) => [t.id, t.label]));
const BACKEND_LABEL: Record<LlmBackend, string> = { claude: "Claude", openrouter: "OpenRouter" };

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function money(n: number): string {
  return n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;
}

// Mean request time, "1.2s" / "14s"; blank when no call succeeded.
function seconds(ms: number | null): string {
  if (ms === null) return "";
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

// DAILY BAR CHART — one series (calls per day; cost when any call cost money), thin
// bars with a 2px gap, recessive baseline, per-bar hover tooltip via <title>.
// Colors are text/border tokens so the chart tracks the theme.
function DailyChart({ days, metric }: { days: UsageReport["daily"]; metric: "cost" | "calls" }) {
  const values = days.map((d) => (metric === "cost" ? d.costUsd : d.calls));
  const max = Math.max(1e-9, ...values);
  const W = 640;
  const H = 160;
  const PAD = 4;
  const n = Math.max(1, days.length);
  // A sparse range (one or two days) must not become one wall-to-wall block: bars
  // are capped at 24px and left-aligned, so a single day reads as a single bar.
  const slot = Math.min(26, (W - PAD * 2) / n);
  const barW = Math.max(2, slot - 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={metric === "cost" ? "Cost per day" : "Calls per day"} style={{ width: "100%", height: "auto", display: "block" }}>

      {/* BASELINE */}
      <line x1={PAD} x2={W - PAD} y1={H - 1} y2={H - 1} stroke="var(--card-border)" strokeWidth={1} />

      {/* BARS */}
      {days.map((d, i) => {
        const v = values[i];
        const h = Math.max(v > 0 ? 2 : 0, ((H - 20) * v) / max);
        const x = PAD + i * slot + 1;
        const y = H - 1 - h;
        return (
          <g key={d.day}>
            <rect x={x} y={y} width={barW} height={h} rx={2} fill="var(--color-primary)">
              <title>{`${d.day}: ${metric === "cost" ? money(d.costUsd) : `${d.calls} calls`}`}</title>
            </rect>
          </g>
        );
      })}

      {/* END LABELS — first and last day only */}
      {days.length > 0 && (
        <>
          <text x={PAD} y={H - 6} fontSize={10} fill="var(--color-gray)">{days[0].day.slice(5)}</text>
          {days.length > 1 && (
            <text x={PAD + (days.length - 1) * slot + barW} y={H - 6} fontSize={10} fill="var(--color-gray)" textAnchor="end">{days[days.length - 1].day.slice(5)}</text>
          )}
        </>
      )}
    </svg>
  );
}

export default function UsagePage() {

  // DATA
  const [report, setReport] = useState<UsageReport | null>(null);

  // INPUT
  const [range, setRange] = useState<UsageRange>("30d");

  // STATE
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let stale = false;
    setIsLoading(true);
    fetch(`/api/users/me/llm-usage?range=${range}`)
      .then((r) => r.json())
      .then((body) => {
        if (stale) return;
        if (body.error) {
          toast.error(body.error);
          return;
        }
        setReport(body);
      })
      .catch(() => { if (!stale) toast.error("Couldn't load usage"); })
      .finally(() => { if (!stale) setIsLoading(false); });
    return () => { stale = true; };
  }, [range]);

  const metric: "cost" | "calls" = useMemo(() => (report && report.summary.costUsd > 0 ? "cost" : "calls"), [report]);

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BREADCRUMBS */}
        <Breadcrumbs />

        {/* PAGE TITLE + HELP */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <h1 className="text-page-title settings-title" style={{ flex: 1, minWidth: 0 }}>
            <BarChart3 className="w-6 h-6" /> Usage
          </h1>
          <HelpButton
            title="Usage"
            sections={[
              { heading: "What's counted", body: "Every model call made for you, on either backend. Tokens and cost come from the provider's own report; Claude calls on the shared CLI show the subscription's notional cost." },
              { heading: "Failed", body: "Calls that errored (no key, provider error, unreadable reply). They count as calls but carry no tokens." },
            ]}
          />
        </div>

        {/* RANGE */}
        <div className="settings-group">
          <SettingsControlRow label="Range">
            <SegmentedToggle options={RANGE_OPTIONS} value={range} onChange={setRange} a11y="radio" ariaLabel="Range" style={{ width: "100%" }} />
          </SettingsControlRow>
        </div>

        {/* LOADING */}
        {isLoading && (
          <div className="loading-container">
            <div className="loading-spinner" />
          </div>
        )}

        {!isLoading && report && (
          <>
            {/* TOTALS */}
            <div className="stat-section" style={{ marginTop: "1rem" }}>
              <div className="stat-card">
                <div className="stat-label">Calls</div>
                <div className="stat-value">{compact(report.summary.calls)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Tokens</div>
                <div className="stat-value">{compact(report.summary.promptTokens + report.summary.completionTokens)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Cost</div>
                <div className="stat-value">{money(report.summary.costUsd)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Time</div>
                <div className="stat-value">{seconds(report.summary.durationMsAvg) || "—"}</div>
              </div>
              <div className={`stat-card${report.summary.failed > 0 ? " stat-card-red" : ""}`}>
                <div className="stat-label">Failed</div>
                <div className="stat-value">{report.summary.failed}</div>
              </div>
            </div>

            {/* BY BACKEND — calls on each; OpenRouter also shows its spend, since that
                is the figure billed to the user's own account */}
            <div className="stat-section" style={{ marginTop: "0.75rem" }}>
              <div className="stat-card">
                <div className="stat-label">Claude</div>
                <div className="stat-value">{[compact(report.summary.byBackend.claude.calls), seconds(report.summary.byBackend.claude.durationMsAvg)].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">OpenRouter</div>
                <div className="stat-value">{[compact(report.summary.byBackend.openrouter.calls), money(report.summary.byBackend.openrouter.costUsd), seconds(report.summary.byBackend.openrouter.durationMsAvg)].filter(Boolean).join(" · ")}</div>
              </div>
            </div>

            {/* DAILY CHART */}
            {report.daily.length > 0 && (
              <>
                <h2 className="settings-section-title">{metric === "cost" ? "Cost per day" : "Calls per day"}</h2>
                <div className="card" style={{ padding: "0.75rem" }}>
                  <DailyChart days={report.daily} metric={metric} />
                </div>
              </>
            )}

            {/* BY TASK */}
            {report.byTask.length > 0 && (
              <>
                <h2 className="settings-section-title">By task</h2>
                <div className="table-container">
                  <table className="table">
                    <thead className="table-header">
                      <tr className="table-header-row">
                        <th className="table-header-cell">Task</th>
                        <th className="table-header-cell">Backend</th>
                        <th className="table-header-cell">Model</th>
                        <th className="table-header-cell">Calls</th>
                        <th className="table-header-cell">Tokens</th>
                        <th className="table-header-cell">Cost</th>
                        <th className="table-header-cell">Time</th>
                      </tr>
                    </thead>
                    <tbody className="table-body">
                      {report.byTask.map((r) => (
                        <tr key={`${r.task}-${r.backend}-${r.model}`} className="table-row">
                          <td className="table-cell">{TASK_LABEL[r.task] ?? r.task}</td>
                          <td className="table-cell">{BACKEND_LABEL[r.backend]}</td>
                          <td className="table-cell font-mono">{r.model}</td>
                          <td className="table-cell">{r.calls}{r.failed > 0 ? ` (${r.failed} failed)` : ""}</td>
                          <td className="table-cell">{compact(r.promptTokens + r.completionTokens)}</td>
                          <td className="table-cell">{money(r.costUsd)}</td>
                          <td className="table-cell">{seconds(r.durationMsAvg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* BY MODEL */}
            {report.byModel.length > 0 && (
              <>
                <h2 className="settings-section-title">By model</h2>
                <div className="table-container">
                  <table className="table">
                    <thead className="table-header">
                      <tr className="table-header-row">
                        <th className="table-header-cell">Model</th>
                        <th className="table-header-cell">Backend</th>
                        <th className="table-header-cell">Calls</th>
                        <th className="table-header-cell">Tokens</th>
                        <th className="table-header-cell">Cost</th>
                        <th className="table-header-cell">Time</th>
                      </tr>
                    </thead>
                    <tbody className="table-body">
                      {report.byModel.map((r) => (
                        <tr key={`${r.backend}-${r.model}`} className="table-row">
                          <td className="table-cell font-mono">{r.model}</td>
                          <td className="table-cell">{BACKEND_LABEL[r.backend]}</td>
                          <td className="table-cell">{r.calls}</td>
                          <td className="table-cell">{compact(r.promptTokens + r.completionTokens)}</td>
                          <td className="table-cell">{money(r.costUsd)}</td>
                          <td className="table-cell">{seconds(r.durationMsAvg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>
    </div>
  );
}
