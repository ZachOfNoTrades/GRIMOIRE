"use client";

import { useState } from "react";
import { ChartPoint, shortDate } from "./InsightLineChart";

const C = {
  textDim: "var(--color-gray)",
  grid: "var(--card-border)",
  surplus: "var(--fg-protein)",
  deficit: "var(--fg-cal)",
};

const VIEW_WIDTH = 400;
const VIEW_HEIGHT = 190;
const PAD = { top: 16, right: 14, bottom: 24, left: 44 };

function dayDiff(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split("-").map(Number);
  const [by, bm, bd] = bIso.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

const kcal = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString()}`;

// Daily energy balance (intake − baseline) as bars around a zero line: surplus
// above, deficit below. Bars sit on the calendar, not by index, so unlogged days
// read as the gaps they are.
export default function BalanceBarChart({ title, startDate, endDate, points }: { title: string; startDate: string; endDate: string; points: ChartPoint[] }) {

  // STATE — index of the hovered/tapped bar.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (points.length === 0) return null;

  const plotLeft = PAD.left;
  const plotRight = VIEW_WIDTH - PAD.right;
  const plotTop = PAD.top;
  const plotBottom = VIEW_HEIGHT - PAD.bottom;
  const spanDays = Math.max(1, dayDiff(startDate, endDate));
  const slot = (plotRight - plotLeft) / (spanDays + 1);
  const xFor = (iso: string) => plotLeft + slot * (dayDiff(startDate, iso) + 0.5);
  const barWidth = Math.max(1.5, Math.min(slot * 0.7, 14));

  // Symmetric y-range so zero sits mid-chart and a surplus and a deficit of the
  // same size draw the same height.
  const extent = Math.max(...points.map((p) => Math.abs(p.value)), 100) * 1.12;
  const yFor = (v: number) => plotTop + (1 - (v + extent) / (2 * extent)) * (plotBottom - plotTop);

  const active = activeIndex != null ? points[activeIndex] : null;

  const nearest = (clientX: number, svg: SVGSVGElement): number => {
    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * VIEW_WIDTH;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(xFor(points[i].date) - svgX) < Math.abs(xFor(points[best].date) - svgX)) best = i;
    }
    return best;
  };

  return (
    /* BALANCE CHART CARD */
    <div className="nutr-detail-chart">

      {/* CHART HEADER */}
      <div className="nutr-detail-chart-head">

        {/* TITLE */}
        <span className="nutr-detail-chart-title">{title}</span>

        {/* ACTIVE READOUT */}
        {active && (
          <span className="nutr-detail-chart-readout">
            {shortDate(active.date)} — <b>{kcal(active.value)} kcal</b>
          </span>
        )}
      </div>

      {/* SVG CHART */}
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="nutr-detail-chart-svg"
        onMouseMove={(e) => setActiveIndex(nearest(e.clientX, e.currentTarget))}
        onMouseLeave={() => setActiveIndex(null)}
        onTouchStart={(e) => setActiveIndex(nearest(e.touches[0].clientX, e.currentTarget))}
        onTouchMove={(e) => setActiveIndex(nearest(e.touches[0].clientX, e.currentTarget))}
        onTouchEnd={() => setActiveIndex(null)}
      >

        {/* GRIDLINES + Y LABELS */}
        {[extent / 1.12, 0, -extent / 1.12].map((v, i) => (
          <g key={i}>
            {/* GRID LINE */}
            <line x1={plotLeft} y1={yFor(v)} x2={plotRight} y2={yFor(v)} style={{ stroke: C.grid }} strokeWidth={v === 0 ? 0.8 : 0.3} strokeOpacity={0.8} />

            {/* Y LABEL */}
            <text x={plotLeft - 5} y={yFor(v) + 3} textAnchor="end" style={{ fill: C.textDim, fontSize: 8 }}>{kcal(v)}</text>
          </g>
        ))}

        {/* BARS */}
        {points.map((p, i) => {
          const y0 = yFor(0);
          const y1 = yFor(p.value);
          return (
            <rect
              key={p.date}
              x={xFor(p.date) - barWidth / 2}
              y={Math.min(y0, y1)}
              width={barWidth}
              height={Math.max(0.5, Math.abs(y1 - y0))}
              rx={Math.min(2, barWidth / 2)}
              style={{ fill: p.value >= 0 ? C.surplus : C.deficit, opacity: activeIndex == null || activeIndex === i ? 1 : 0.5 }}
            />
          );
        })}

        {/* X LABELS */}
        <text x={plotLeft} y={plotBottom + 14} textAnchor="start" style={{ fill: C.textDim, fontSize: 8 }}>{shortDate(startDate)}</text>
        <text x={plotRight} y={plotBottom + 14} textAnchor="end" style={{ fill: C.textDim, fontSize: 8 }}>{shortDate(endDate)}</text>
      </svg>

      {/* LEGEND */}
      <div className="insight-legend">
        <span className="insight-legend-item"><span className="insight-legend-dot" style={{ background: C.surplus }} />Surplus</span>
        <span className="insight-legend-item"><span className="insight-legend-dot" style={{ background: C.deficit }} />Deficit</span>
      </div>
    </div>
  );
}
