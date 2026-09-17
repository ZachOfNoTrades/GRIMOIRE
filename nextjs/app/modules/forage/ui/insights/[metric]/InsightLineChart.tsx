"use client";

import { useState } from "react";

// Color tokens — CSS custom properties only (mirrors NutrientTrendChart).
const C = {
  textDim: "var(--color-gray)",
  grid: "var(--card-border)",
};

// ─── Chart layout ───────────────────────────────────────────
const VIEW_WIDTH = 400;
const VIEW_HEIGHT = 190;
const PAD = { top: 16, right: 14, bottom: 24, left: 44 };

export interface ChartPoint {
  date: string;
  value: number;
}

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  points: ChartPoint[];
  // "line" joins the points; "dots" plots each point on its own (raw readings).
  kind: "line" | "dots";
}

export interface ChartRefLine {
  key: string;
  label: string;
  color: string;
  value: number;
}

interface InsightLineChartProps {
  title: string;
  startDate: string;
  endDate: string;
  series: ChartSeries[];
  refLines?: ChartRefLine[];
  format: (n: number) => string;
  unit: string;
  // Floor on the plotted y-range, so movement inside the noise band renders flat
  // instead of filling the chart (see ui/home/weightTrend).
  minSpan?: number;
}

function dayDiff(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split("-").map(Number);
  const [by, bm, bd] = bIso.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

// "YYYY-MM-DD" → "M/D" without constructing a local Date (no TZ drift).
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

// Time-scaled line chart for the insight pages. Unlike the nutrient trend chart
// (bars spaced by index, one per logged day), x here is the calendar: a weigh-in
// cadence or a logging gap is part of what these pages show, and index spacing
// would hide it.
export default function InsightLineChart({ title, startDate, endDate, series, refLines = [], format, unit, minSpan }: InsightLineChartProps) {

  // STATE — the hovered/tapped day (null when not interacting).
  const [activeDate, setActiveDate] = useState<string | null>(null);

  const values = series.flatMap((s) => s.points.map((p) => p.value));
  if (values.length === 0) return null;

  const plotLeft = PAD.left;
  const plotRight = VIEW_WIDTH - PAD.right;
  const plotTop = PAD.top;
  const plotBottom = VIEW_HEIGHT - PAD.bottom;
  const spanDays = Math.max(1, dayDiff(startDate, endDate));
  const xFor = (iso: string) => plotLeft + (dayDiff(startDate, iso) / spanDays) * (plotRight - plotLeft);

  // Y domain: every plotted value and reference line, padded 10%, widened to
  // minSpan around its midpoint when the data moves less than that.
  const domain = [...values, ...refLines.map((r) => r.value)];
  let min = Math.min(...domain);
  let max = Math.max(...domain);
  if (minSpan && max - min < minSpan) {
    const mid = (min + max) / 2;
    min = mid - minSpan / 2;
    max = mid + minSpan / 2;
  }
  const pad = (max - min || 1) * 0.1;
  min -= pad;
  max += pad;
  const yFor = (v: number) => plotTop + (1 - (v - min) / (max - min)) * (plotBottom - plotTop);
  const gridValues = [min + pad, (min + max) / 2, max - pad];

  // Pointer x (client px) → nearest calendar day inside the range.
  const dateAt = (clientX: number, svg: SVGSVGElement): string => {
    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * VIEW_WIDTH;
    const offset = Math.round(((svgX - plotLeft) / (plotRight - plotLeft)) * spanDays);
    return shiftIso(startDate, Math.max(0, Math.min(spanDays, offset)));
  };

  // Readout: each series' value on the active day, or its nearest point within
  // the series for "dots" (a weigh-in rarely lands on the exact hovered day).
  const readout = activeDate
    ? series
        .map((s) => {
          if (s.points.length === 0) return null;
          const nearest = s.points.reduce((best, p) =>
            Math.abs(dayDiff(p.date, activeDate)) < Math.abs(dayDiff(best.date, activeDate)) ? p : best,
          );
          const within = s.kind === "line" ? nearest.date === activeDate : Math.abs(dayDiff(nearest.date, activeDate)) <= 1;
          return within ? { key: s.key, label: s.label, color: s.color, value: nearest.value } : null;
        })
        .filter((r): r is { key: string; label: string; color: string; value: number } => r !== null)
    : [];

  return (
    /* LINE CHART CARD */
    <div className="nutr-detail-chart">

      {/* CHART HEADER — title + active-day readout */}
      <div className="nutr-detail-chart-head">

        {/* TITLE */}
        <span className="nutr-detail-chart-title">{title}</span>

        {/* ACTIVE READOUT */}
        {activeDate && (
          <span className="nutr-detail-chart-readout">
            {shortDate(activeDate)}
            {readout.map((r) => (
              <span key={r.key} className="insight-readout-item">
                {" "}· <span style={{ color: r.color }}>{r.label}</span> <b>{format(r.value)}</b>
              </span>
            ))}
          </span>
        )}
      </div>

      {/* SVG CHART */}
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="nutr-detail-chart-svg"
        onMouseMove={(e) => setActiveDate(dateAt(e.clientX, e.currentTarget))}
        onMouseLeave={() => setActiveDate(null)}
        onTouchStart={(e) => setActiveDate(dateAt(e.touches[0].clientX, e.currentTarget))}
        onTouchMove={(e) => setActiveDate(dateAt(e.touches[0].clientX, e.currentTarget))}
        onTouchEnd={() => setActiveDate(null)}
      >

        {/* GRIDLINES + Y LABELS */}
        {gridValues.map((v, i) => (
          <g key={i}>
            {/* GRID LINE */}
            <line x1={plotLeft} y1={yFor(v)} x2={plotRight} y2={yFor(v)} style={{ stroke: C.grid }} strokeWidth="0.3" strokeOpacity={0.6} />

            {/* Y LABEL */}
            <text x={plotLeft - 5} y={yFor(v) + 3} textAnchor="end" style={{ fill: C.textDim, fontSize: 8 }}>{format(v)}</text>
          </g>
        ))}

        {/* REFERENCE LINES */}
        {refLines.map((r) => (
          <g key={r.key}>
            {/* DASHED MARKER LINE */}
            <line x1={plotLeft} y1={yFor(r.value)} x2={plotRight} y2={yFor(r.value)} style={{ stroke: r.color }} strokeWidth="0.8" strokeDasharray="3,3" strokeOpacity={0.85} />

            {/* MARKER LABEL */}
            <text x={plotRight} y={yFor(r.value) - 2.5} textAnchor="end" style={{ fill: r.color, fontSize: 7.5, fontWeight: 600 }}>{r.label}</text>
          </g>
        ))}

        {/* ACTIVE DAY GUIDE */}
        {activeDate && (
          <line x1={xFor(activeDate)} y1={plotTop} x2={xFor(activeDate)} y2={plotBottom} style={{ stroke: C.textDim }} strokeWidth="0.6" strokeOpacity={0.6} />
        )}

        {/* SERIES */}
        {series.map((s) =>
          s.kind === "line" ? (
            /* LINE SERIES */
            <path
              key={s.key}
              d={s.points.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(p.date).toFixed(2)},${yFor(p.value).toFixed(2)}`).join(" ")}
              fill="none"
              style={{ stroke: s.color }}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            /* DOT SERIES */
            <g key={s.key}>
              {s.points.map((p) => (
                <circle key={p.date} cx={xFor(p.date).toFixed(2)} cy={yFor(p.value).toFixed(2)} r="1.8" style={{ fill: s.color }} />
              ))}
            </g>
          ),
        )}

        {/* X LABELS — range ends */}
        <text x={plotLeft} y={plotBottom + 14} textAnchor="start" style={{ fill: C.textDim, fontSize: 8 }}>{shortDate(startDate)}</text>
        <text x={plotRight} y={plotBottom + 14} textAnchor="end" style={{ fill: C.textDim, fontSize: 8 }}>{shortDate(endDate)}</text>
      </svg>

      {/* LEGEND */}
      {series.length + refLines.length > 1 && (
        <div className="insight-legend">
          {series.map((s) => (
            /* LEGEND ITEM */
            <span key={s.key} className="insight-legend-item">
              <span className={s.kind === "line" ? "insight-legend-line" : "insight-legend-dot"} style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      {/* UNIT NOTE — screen-reader context for the axis */}
      <span className="sr-only">Values in {unit}</span>
    </div>
  );
}
