"use client";

import { useState } from "react";
import { NutrientDailyPoint } from "../../../types/food";

// Color tokens — CSS custom properties only, no hardcoded colors (mirrors
// nutrientMeter's palette so the chart reads the same as the rest of nutrition).
const C = {
  text: "var(--color-primary)",
  textMuted: "var(--color-secondary)",
  textDim: "var(--color-gray)",
  grid: "var(--card-border)",
  good: "var(--fg-carb)", // green — in band / cleared
  amber: "var(--alert-yellow-text)", // under a floor (deficient)
  danger: "var(--alert-red-text)", // over a ceiling (excess)
  neutral: "var(--fg-cal)", // lone-target / macro bars (no over/under verdict)
};

// ─── Chart layout ───────────────────────────────────────────
const VIEW_WIDTH = 400;
const VIEW_HEIGHT = 180;
const PAD = { top: 16, right: 14, bottom: 24, left: 40 };

interface NutrientTrendChartProps {
  points: NutrientDailyPoint[];
  unit: string;
  floor: number | null;
  target: number | null;
  ceiling: number | null;
  // Lone target / macro goal → bars stay neutral (over/under a single goal isn't
  // inherently good or bad). A real band (floor and/or ceiling) → color per state.
  hasBand: boolean;
}

// "YYYY-MM-DD" → "M/D" without constructing a Date (avoids TZ drift on the ISO date).
function shortLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

// Compact axis/tooltip number: trace values keep a decimal, else whole w/ commas.
function fmt(n: number): string {
  if (n > 0 && n < 1) return n.toFixed(1);
  if (n < 10) return String(Math.round(n * 10) / 10);
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default function NutrientTrendChart({ points, unit, floor, target, ceiling, hasBand }: NutrientTrendChartProps) {

  // STATE — index of the hovered/tapped bar (null when not interacting).
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Need at least two logged days for a trend to mean anything.
  if (points.length < 2) return null;

  // Plot area edges.
  const plotLeft = PAD.left;
  const plotRight = VIEW_WIDTH - PAD.right;
  const plotTop = PAD.top;
  const plotBottom = VIEW_HEIGHT - PAD.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  // Y scale: 0 → max(observed, the topmost band marker) + headroom. Band markers
  // are included so a day far under the ceiling still shows the ceiling line.
  const observedMax = Math.max(...points.map((p) => p.value));
  const bandMax = Math.max(floor ?? 0, target ?? 0, ceiling ?? 0);
  const yMax = Math.max(observedMax, bandMax) * 1.12 || 1;
  const yFor = (v: number) => plotTop + (1 - v / yMax) * plotHeight;

  // Evenly spaced bars across the plot (by index, not calendar date — only logged
  // days appear, so spacing them evenly keeps thin bars legible over long ranges).
  const slot = plotWidth / points.length;
  const barWidth = Math.max(1.5, Math.min(slot * 0.7, 14));

  // Per-bar color: red over a ceiling, amber under a floor, green in band; neutral
  // when there's no real band to judge against (lone target / macro goal).
  const barColor = (v: number): string => {
    if (!hasBand) return C.neutral;
    if (ceiling != null && v > ceiling) return C.danger;
    if (floor != null && v < floor) return C.amber;
    return C.good;
  };

  // Band reference lines that fall within the visible y-range.
  const bandLines = [
    { key: "floor", value: floor, color: C.amber, label: "Floor" },
    { key: "target", value: target, color: hasBand ? C.good : C.neutral, label: "Target" },
    { key: "ceiling", value: ceiling, color: C.danger, label: "Ceiling" },
  ].filter((b): b is { key: string; value: number; color: string; label: string } => b.value != null && b.value <= yMax);

  // Three y-axis gridlines (0, mid, top).
  const gridValues = [0, yMax / 2, yMax];

  const active = activeIndex != null ? points[activeIndex] : null;

  // Nearest bar to a pointer x (in client px), mapped into viewBox space.
  const findNearest = (clientX: number, svg: SVGSVGElement): number => {
    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * VIEW_WIDTH;
    const i = Math.floor((svgX - plotLeft) / slot);
    return Math.max(0, Math.min(points.length - 1, i));
  };

  return (
    /* TREND CHART CARD */
    <div className="nutr-detail-chart">

      {/* CHART HEADER — title + active-bar readout */}
      <div className="nutr-detail-chart-head">

        {/* TITLE */}
        <span className="nutr-detail-chart-title">Daily intake</span>

        {/* ACTIVE READOUT — date + value of the hovered/tapped bar */}
        {active && (
          <span className="nutr-detail-chart-readout">
            {shortLabel(active.date)} — <b>{fmt(active.value)} {unit}</b>
          </span>
        )}
      </div>

      {/* SVG CHART */}
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="nutr-detail-chart-svg"
        onMouseMove={(e) => setActiveIndex(findNearest(e.clientX, e.currentTarget))}
        onMouseLeave={() => setActiveIndex(null)}
        onTouchStart={(e) => setActiveIndex(findNearest(e.touches[0].clientX, e.currentTarget))}
        onTouchMove={(e) => setActiveIndex(findNearest(e.touches[0].clientX, e.currentTarget))}
        onTouchEnd={() => setActiveIndex(null)}
      >

        {/* GRIDLINES + Y LABELS */}
        {gridValues.map((v, i) => (
          <g key={i}>
            {/* GRID LINE */}
            <line x1={plotLeft} y1={yFor(v)} x2={plotRight} y2={yFor(v)} style={{ stroke: C.grid }} strokeWidth="0.3" strokeOpacity={0.6} />

            {/* Y LABEL */}
            <text x={plotLeft - 5} y={yFor(v) + 3} textAnchor="end" style={{ fill: C.textDim, fontSize: 8 }}>{fmt(v)}</text>
          </g>
        ))}

        {/* BAND REFERENCE LINES — floor / target / ceiling */}
        {bandLines.map((b) => (
          <g key={b.key}>
            {/* DASHED MARKER LINE */}
            <line x1={plotLeft} y1={yFor(b.value)} x2={plotRight} y2={yFor(b.value)} style={{ stroke: b.color }} strokeWidth="0.8" strokeDasharray="3,3" strokeOpacity={0.85} />

            {/* MARKER LABEL */}
            <text x={plotRight} y={yFor(b.value) - 2.5} textAnchor="end" style={{ fill: b.color, fontSize: 7.5, fontWeight: 600 }}>{b.label}</text>
          </g>
        ))}

        {/* BARS — one per logged day */}
        {points.map((p, i) => {
          const cx = plotLeft + slot * (i + 0.5);
          const y = yFor(p.value);
          const h = Math.max(0, plotBottom - y);
          const isActive = activeIndex === i;
          return (
            <rect
              key={p.date}
              x={cx - barWidth / 2}
              y={y}
              width={barWidth}
              height={h}
              rx={Math.min(2, barWidth / 2)}
              style={{ fill: barColor(p.value), opacity: activeIndex == null || isActive ? 1 : 0.5 }}
            />
          );
        })}

        {/* X LABELS — first + last day only (range selector carries the rest) */}
        <text x={plotLeft + slot * 0.5} y={plotBottom + 14} textAnchor="middle" style={{ fill: C.textDim, fontSize: 8 }}>{shortLabel(points[0].date)}</text>
        <text x={plotLeft + slot * (points.length - 0.5)} y={plotBottom + 14} textAnchor="middle" style={{ fill: C.textDim, fontSize: 8 }}>{shortLabel(points[points.length - 1].date)}</text>
      </svg>
    </div>
  );
}
