"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import toast, { Toaster } from "@/components/Toaster";
import HelpButton from "@/components/ui/HelpButton";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/Breadcrumbs";
import SegmentedToggle, { type SegmentedOption } from "@/components/ui/SegmentedToggle";
import SortHeaderCell from "@/components/ui/SortHeaderCell";
import TableScroll from "@/components/ui/TableScroll";
import { SettingsControlRow } from "@/components/settings/SettingsList";
import { defaultIcon, iconMap } from "@/lib/iconMap";
import { LLM_TASKS, type LlmTaskGroup } from "@/lib/llm/tasks";
import type { LlmBackend } from "@/lib/llm/types";
import type { UsageRange, UsageReport, UsageTotals } from "@/lib/llm/usage";
import { sortRows, type SortValue } from "@/lib/tableSort";
import { usageView } from "@/lib/usageView";
import { SortDirection } from "@/types/sortDirection";
import { UsageView } from "@/types/usageView";

const RANGE_OPTIONS: SegmentedOption<UsageRange>[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All" },
];

const TASK_LABEL: Record<string, string> = Object.fromEntries(LLM_TASKS.map((t) => [t.id, t.label]));
const BACKEND_LABEL: Record<LlmBackend, string> = { claude: "Claude", openrouter: "OpenRouter" };

type TaskRow = UsageReport["byTask"][number];
type ModelRow = UsageReport["byModel"][number];

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function money(n: number): string {
  return n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;
}

// Format a mean request time as 1.2s or 14s, blank when no call succeeded
function seconds(ms: number | null): string {
  if (ms === null) return "";
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

// Format a module's share of the total cost, such as 14% or <1%
function share(cost: number, total: number): string {
  if (total <= 0 || cost <= 0) return "0%";
  const percent = (cost / total) * 100;
  return percent < 1 ? "<1%" : `${Math.round(percent)}%`;
}

function tokens(t: UsageTotals): number {
  return t.promptTokens + t.completionTokens;
}

function sectionId(module: LlmTaskGroup): string {
  return `usage-${module}`;
}

// A UsageColumn is one column of a usage table: its header, fixed width, sort value and cell.
interface UsageColumn<T> {
  label: string;
  width: number;
  sortValue: (row: T) => SortValue;
  // Direction a first click sorts in: largest first for amounts, A to Z for names.
  firstDirection: SortDirection;
  cell: (row: T) => ReactNode;
  // Full text of the cell, shown as its tooltip when the column cuts it off.
  title?: (row: T) => string;
  isMono?: boolean;
}

const TASK_COLUMNS: UsageColumn<TaskRow>[] = [
  { label: "Task", width: 240, sortValue: (r) => TASK_LABEL[r.task] ?? r.task, firstDirection: SortDirection.Ascending, cell: (r) => TASK_LABEL[r.task] ?? r.task, title: (r) => TASK_LABEL[r.task] ?? r.task },
  { label: "Cost", width: 100, sortValue: (r) => r.costUsd, firstDirection: SortDirection.Descending, cell: (r) => money(r.costUsd) },
  { label: "Calls", width: 160, sortValue: (r) => r.calls, firstDirection: SortDirection.Descending, cell: (r) => r.calls },
  { label: "Tokens", width: 100, sortValue: (r) => tokens(r), firstDirection: SortDirection.Descending, cell: (r) => compact(tokens(r)) },
  { label: "Time", width: 80, sortValue: (r) => r.durationMsAvg, firstDirection: SortDirection.Descending, cell: (r) => seconds(r.durationMsAvg) },
  { label: "Backend", width: 130, sortValue: (r) => BACKEND_LABEL[r.backend], firstDirection: SortDirection.Ascending, cell: (r) => BACKEND_LABEL[r.backend] },
  { label: "Model", width: 330, sortValue: (r) => r.model, firstDirection: SortDirection.Ascending, cell: (r) => r.model, title: (r) => r.model, isMono: true },
];

// Build the model table's columns, naming each model's modules after their module records
function modelColumns(moduleNames: Map<LlmTaskGroup, string>): UsageColumn<ModelRow>[] {
  const modulesText = (r: ModelRow) => r.modules.map((m) => moduleNames.get(m) ?? m).join(", ");
  return [
    { label: "Model", width: 330, sortValue: (r) => r.model, firstDirection: SortDirection.Ascending, cell: (r) => r.model, title: (r) => r.model, isMono: true },
    { label: "Cost", width: 100, sortValue: (r) => r.costUsd, firstDirection: SortDirection.Descending, cell: (r) => money(r.costUsd) },
    { label: "Modules", width: 150, sortValue: (r) => modulesText(r) || null, firstDirection: SortDirection.Ascending, cell: modulesText, title: modulesText },
    { label: "Calls", width: 80, sortValue: (r) => r.calls, firstDirection: SortDirection.Descending, cell: (r) => r.calls },
    { label: "Tokens", width: 100, sortValue: (r) => tokens(r), firstDirection: SortDirection.Descending, cell: (r) => compact(tokens(r)) },
    { label: "Time", width: 80, sortValue: (r) => r.durationMsAvg, firstDirection: SortDirection.Descending, cell: (r) => seconds(r.durationMsAvg) },
    { label: "Backend", width: 130, sortValue: (r) => BACKEND_LABEL[r.backend], firstDirection: SortDirection.Ascending, cell: (r) => BACKEND_LABEL[r.backend] },
  ];
}

// Show a usage table with fixed column widths, sorted by cost until a header is clicked
function UsageTable<T>({ columns, rows, rowKey, label }: { columns: UsageColumn<T>[]; rows: T[]; rowKey: (row: T) => string; label: string }) {

  // INPUT
  const [sortColumn, setSortColumn] = useState(() => Math.max(0, columns.findIndex((c) => c.label === "Cost")));
  const [sortDirection, setSortDirection] = useState(SortDirection.Descending);

  const sortedRows = useMemo(() => sortRows(rows, columns[sortColumn].sortValue, sortDirection), [rows, columns, sortColumn, sortDirection]);

  // Flip the direction on the sorted column, or sort a new column in its first direction
  const sortBy = (index: number) => {
    if (index === sortColumn) {
      setSortDirection(sortDirection === SortDirection.Ascending ? SortDirection.Descending : SortDirection.Ascending);
      return;
    }
    setSortColumn(index);
    setSortDirection(columns[index].firstDirection);
  };

  if (rows.length === 0) return <div className="table-empty-box">No calls in this range.</div>;

  const minWidth = columns.reduce((sum, c) => sum + c.width, 0);
  return (
    <TableScroll>

      {/* TABLE */}
      <table className="table table-fixed" style={{ minWidth }} aria-label={label}>
        <colgroup>
          {columns.map((c) => <col key={c.label} style={{ width: c.width }} />)}
        </colgroup>

        {/* HEADER */}
        <thead className="table-header">
          <tr className="table-header-row">
            {columns.map((c, index) => (
              <SortHeaderCell key={c.label} label={c.label} direction={index === sortColumn ? sortDirection : null} onSort={() => sortBy(index)} />
            ))}
          </tr>
        </thead>

        {/* ROWS */}
        <tbody className="table-body">
          {sortedRows.map((row) => (
            <tr key={rowKey(row)} className="table-row">
              {columns.map((c) => (
                <td key={c.label} className={`table-cell${c.isMono ? " font-mono" : ""}`} title={c.title?.(row)}>{c.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

// A ChartBar is one day's bar: the day and its cost or calls.
interface ChartBar {
  day: string;
  value: number;
}

// Draw a bar per day in the report, its height the cost or calls of the modules shown
function DailyChart({ days, isCost }: { days: ChartBar[]; isCost: boolean }) {
  const values = days.map((d) => d.value);
  const max = Math.max(1e-9, ...values);
  const W = 640;
  const H = 160;
  const PAD = 4;
  const n = Math.max(1, days.length);
  // Cap bars at 24px and left-align them, to avoid a one-day range drawing one wall-to-wall block
  const slot = Math.min(26, (W - PAD * 2) / n);
  const barW = Math.max(2, slot - 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={isCost ? "Cost per day" : "Calls per day"} style={{ width: "100%", height: "auto", display: "block" }}>

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
              <title>{`${d.day}: ${isCost ? money(v) : `${v} calls`}`}</title>
            </rect>
          </g>
        );
      })}

      {/* FIRST AND LAST DAY LABELS */}
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

// Show the signed-in user's model-call usage for a range, by module and by model
export default function UsageClient({ initialReport, initialChartModules }: { initialReport: UsageReport | null; initialChartModules: LlmTaskGroup[] }) {

  // DATA
  const [report, setReport] = useState<UsageReport | null>(initialReport);

  // INPUT
  const [range, setRange] = useState<UsageRange>(initialReport?.range ?? "30d");
  const [chartModules, setChartModules] = useState<LlmTaskGroup[]>(initialChartModules);

  // STATE
  const [loadedRange, setLoadedRange] = useState<UsageRange | null>(initialReport?.range ?? null);
  const [isFirstLoadFailed, setIsFirstLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  // Fetch the report when the range differs from the one on screen, clearing a failed first load and dropping an answer for a range no longer picked
  useEffect(() => {
    if (loadedRange === range) return;
    let isStale = false;
    setIsFirstLoadFailed(false);

    // Show the error, then put the Range control back on the range on screen, or show the failed first load
    const fail = (message: string) => {
      toast.error(message);
      if (loadedRange) setRange(loadedRange);
      else setIsFirstLoadFailed(true);
    };
    fetch(`/api/users/me/llm-usage?range=${range}`)
      .then(async (res) => {
        const body = await res.json();
        if (isStale) return;
        if (!res.ok || body.error) return fail(body.error ?? "Couldn't load usage");
        setLoadedRange(range);
        setReport(body);
      })
      .catch(() => { if (!isStale) fail("Couldn't load usage"); });
    return () => { isStale = true; };
  }, [range, loadedRange, loadAttempt]);

  // Load the report again after a failed first load
  const retry = () => setLoadAttempt(loadAttempt + 1);

  const view = usageView(report !== null, isFirstLoadFailed);
  const isRefreshing = report !== null && loadedRange !== range;

  const isCostChart = !!report && report.summary.costUsd > 0;
  const isAllChartModules = chartModules.length === 0;

  // Sum each day's cost or calls over the modules the chart filter shows, or take the whole day when it shows all
  const chartBars = useMemo((): ChartBar[] => (report?.daily ?? []).map((d) => ({
    day: d.day,
    value: isAllChartModules
      ? (isCostChart ? d.costUsd : d.calls)
      : chartModules.reduce((sum, m) => sum + (isCostChart ? d.byModule[m].costUsd : d.byModule[m].calls), 0),
  })), [report, chartModules, isAllChartModules, isCostChart]);

  // Change which modules the chart shows when a filter row is clicked
  // 1. From all, show only the clicked module
  // 2. Add a grayed module
  // 3. Remove a shown module, going back to all once none is left
  const toggleChartModule = (module: LlmTaskGroup) => {
    if (isAllChartModules) return setChartModules([module]);
    if (!chartModules.includes(module)) return setChartModules([...chartModules, module]);
    setChartModules(chartModules.filter((m) => m !== module));
  };
  const moduleNames = useMemo(() => new Map((report?.modules ?? []).map((m) => [m.module, m.name])), [report]);
  const columnsForModels = useMemo(() => modelColumns(moduleNames), [moduleNames]);

  return (

    // PAGE
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
              { heading: "Modules", body: "Each tile shows what a module's calls cost, its share of the total cost, and its calls and tokens. Tap a tile to jump to that module's tasks. Each task table starts sorted by cost; tap a column header to sort by it, and tap it again to reverse." },
              { heading: "Cost per day", body: "The modules listed beside the chart pick what it shows. With all of them lit, it shows every module. Tap one to show only that module, tap a grayed one to add it, and tap a lit one to remove it; removing the last shows every module again. Usage opened from a module's settings starts with only that module shown. The tiles and tables always cover every module." },
              { heading: "Models", body: "Calls on the shared Claude CLI and on your own OpenRouter key, then every model used, with the modules whose tasks ran on it." },
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
        {view === UsageView.Loading && (
          <div className="loading-container">
            <div className="loading-spinner" />
          </div>
        )}

        {/* FAILED FIRST LOAD */}
        {view === UsageView.Failed && (
          <div className="table-empty-box mt-4">
            <p>Couldn&apos;t load usage.</p>
            <Button className="btn-blue mt-3" onClick={retry}>Retry</Button>
          </div>
        )}

        {report && (
          <div className={isRefreshing ? "is-refreshing" : undefined} aria-busy={isRefreshing}>

            {/* TOTALS */}
            <div className="stat-section mt-4">
              <div className="stat-card">
                <div className="stat-label">Calls</div>
                <div className="stat-value">{compact(report.summary.calls)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Tokens</div>
                <div className="stat-value">{compact(tokens(report.summary))}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Cost</div>
                <div className="stat-value">{money(report.summary.costUsd)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Time</div>
                <div className="stat-value">{seconds(report.summary.durationMsAvg) || "—"}</div>
              </div>
            </div>

            {/* EMPTY RANGE */}
            {report.summary.calls === 0 && <div className="table-empty-box mt-4">No calls in this range.</div>}

            {report.summary.calls > 0 && (
              <>

                {/* MODULES SECTION */}
                <section className="page-section">
                  <h2 className="text-h1 page-section-title">Modules</h2>

                  {/* MODULE TILES */}
                  <div className="tile-grid">
                    {report.modules.map((m) => (
                      <a key={m.module} className="tile-card" href={`#${sectionId(m.module)}`}>

                        {/* TILE HEADER */}
                        <div className="tile-card-header">
                          <span className="text-card-title">{m.name}</span>
                          <span className="tile-card-corner">{share(m.costUsd, report.summary.costUsd)}</span>
                        </div>

                        {/* COST */}
                        <div className="stat-value">{money(m.costUsd)}</div>

                        {/* CALLS AND TOKENS */}
                        <div className="tile-card-meta">
                          <span>{compact(m.calls)} calls</span>
                          <span className="tile-card-meta-separator"> · </span>
                          <span>{compact(tokens(m))} tokens</span>
                        </div>
                      </a>
                    ))}
                  </div>

                  {/* DAILY CHART */}
                  <h3 className="settings-section-title">{isCostChart ? "Cost per day" : "Calls per day"}</h3>
                  <div className="chart-with-filter">

                    {/* CHART FILTER */}
                    <div className="chart-filter" role="group" aria-label="Modules shown in the chart">
                      {report.modules.map((m) => {
                        const ModuleIcon = iconMap[m.icon ?? ""] ?? defaultIcon;
                        const isSelected = chartModules.includes(m.module);
                        return (
                          <Button
                            key={m.module}
                            type="button"
                            className={`chart-filter-row ${isAllChartModules || isSelected ? "is-on" : "is-off"}`}
                            aria-pressed={isSelected}
                            onClick={() => toggleChartModule(m.module)}
                          >
                            <ModuleIcon className="chart-filter-icon" />
                            <span className="chart-filter-name">{m.name}</span>
                          </Button>
                        );
                      })}
                    </div>

                    {/* CHART */}
                    <div className="card chart-card">
                      <DailyChart days={chartBars} isCost={isCostChart} />
                    </div>
                  </div>

                  {/* MODULE TASK TABLES */}
                  {report.modules.map((m) => (
                    <div key={m.module}>
                      <h3 className="settings-section-title scroll-target" id={sectionId(m.module)}>{m.name}</h3>
                      <UsageTable
                        columns={TASK_COLUMNS}
                        rows={report.byTask.filter((t) => t.module === m.module)}
                        rowKey={(r) => `${r.task}-${r.backend}-${r.model}`}
                        label={`${m.name} tasks`}
                      />
                    </div>
                  ))}
                </section>

                {/* MODELS SECTION */}
                <section className="page-section">
                  <h2 className="text-h1 page-section-title">Models</h2>

                  {/* BY BACKEND */}
                  <div className="stat-section">
                    <div className="stat-card">
                      <div className="stat-label">Claude</div>
                      <div className="stat-value">{[compact(report.summary.byBackend.claude.calls), seconds(report.summary.byBackend.claude.durationMsAvg)].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">OpenRouter</div>
                      <div className="stat-value">{[compact(report.summary.byBackend.openrouter.calls), money(report.summary.byBackend.openrouter.costUsd), seconds(report.summary.byBackend.openrouter.durationMsAvg)].filter(Boolean).join(" · ")}</div>
                    </div>
                  </div>

                  {/* MODEL TABLE */}
                  <div className="mt-4">
                    <UsageTable columns={columnsForModels} rows={report.byModel} rowKey={(r) => `${r.backend}-${r.model}`} label="Models" />
                  </div>
                </section>
              </>
            )}
          </div>
        )}

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>
    </div>
  );
}
