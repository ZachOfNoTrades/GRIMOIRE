"use client";

import { useState } from "react";
import { DeckStudySession } from "../types/study";
import { RATING_SCALE, RATING_CHART_COLORS, ratingLabel } from "../lib/rating";

// Color tokens — CSS custom properties only, no hardcoded colors (same approach as
// forage's NutrientTrendChart, so the charts read as one family across modules).
const C = {
  textDim: "var(--color-gray)",
  grid: "var(--card-border)",
  surface: "var(--card-bg)",
  // The accuracy trend is a single series, so it wears plain ink rather than
  // borrowing a rating hue and implying it means "Easy".
  line: "var(--color-primary)",
  mean: "var(--color-gray)",
};

// ─── Chart layout ───────────────────────────────────────────
const VIEW_WIDTH = 400;
const VIEW_HEIGHT = 150;
const PAD = { top: 14, right: 12, bottom: 22, left: 30 };

const plotLeft = PAD.left;
const plotRight = VIEW_WIDTH - PAD.right;
const plotTop = PAD.top;
const plotBottom = VIEW_HEIGHT - PAD.bottom;
const plotWidth = plotRight - plotLeft;
const plotHeight = plotBottom - plotTop;

// "M/D" for an axis tick — short enough to sit under a thin bar on a phone.
function shortLabel(date: Date | string): string {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Nearest column to a pointer x (in client px), mapped into viewBox space.
function findNearest(clientX: number, svg: SVGSVGElement, count: number): number {
  const rect = svg.getBoundingClientRect();
  const svgX = ((clientX - rect.left) / rect.width) * VIEW_WIDTH;
  const index = Math.floor((svgX - plotLeft) / (plotWidth / count));
  return Math.max(0, Math.min(count - 1, index));
}

interface StudyHistoryChartsProps {
  // Sessions in the section's own order (newest first); the charts plot them
  // oldest-first, left to right, the way time reads.
  sessions: DeckStudySession[];
}

// STUDY HISTORY CHARTS — two views of the same window, each answering a different
// question and each on its own single axis (never one chart with two y-scales):
// "how much did I do, and how did it go" (reviews stacked by rating) and "am I
// getting better" (accuracy per session). Both redraw with the date filter.
export default function StudyHistoryCharts({ sessions }: StudyHistoryChartsProps) {

  // STATE — index of the hovered/tapped session, shared by both charts so pointing
  // at a session in one reads it out in the other.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // A trend needs at least two points; one session is a row, not a shape.
  const points = [...sessions].reverse();
  if (points.length < 2) return null;

  // ─── Volume chart scale — reviews per session, stacked by rating ───
  const maxReviews = Math.max(...points.map((s) => s.reviews), 1);
  const slot = plotWidth / points.length;
  const barWidth = Math.max(1.5, Math.min(slot * 0.7, 14));
  const volumeY = (value: number) => plotTop + (1 - value / maxReviews) * plotHeight;

  // ─── Accuracy chart scale — fixed 0-100, because a percentage's meaning comes
  // from the whole scale; auto-fitting it would make 88% look like a collapse. ───
  const accuracy = points.map((s) => (s.reviews > 0 ? (s.correct / s.reviews) * 100 : 0));
  const accuracyY = (value: number) => plotTop + (1 - value / 100) * plotHeight;
  const meanAccuracy = accuracy.reduce((total, value) => total + value, 0) / accuracy.length;
  const linePath = accuracy
    .map((value, i) => `${i === 0 ? "M" : "L"} ${plotLeft + slot * (i + 0.5)} ${accuracyY(value)}`)
    .join(" ");

  const active = activeIndex != null ? points[activeIndex] : null;
  const activeAccuracy = activeIndex != null ? accuracy[activeIndex] : null;

  // Pointer handlers are identical on both charts — one set, bound twice.
  const pointerProps = {
    onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => setActiveIndex(findNearest(e.clientX, e.currentTarget, points.length)),
    onMouseLeave: () => setActiveIndex(null),
    onTouchStart: (e: React.TouchEvent<SVGSVGElement>) => setActiveIndex(findNearest(e.touches[0].clientX, e.currentTarget, points.length)),
    onTouchMove: (e: React.TouchEvent<SVGSVGElement>) => setActiveIndex(findNearest(e.touches[0].clientX, e.currentTarget, points.length)),
    onTouchEnd: () => setActiveIndex(null),
  };

  return (

    /* CHARTS */
    <div className="rune-charts">

      {/* VOLUME CHART — reviews per session, stacked by rating */}
      <div className="rune-chart">

        {/* CHART HEADER — title + hovered-session readout */}
        <div className="rune-chart-head">

          {/* TITLE */}
          <span className="rune-chart-title">Reviews per session</span>

          {/* ACTIVE READOUT */}
          {active && (
            <span className="rune-chart-readout">
              {shortLabel(active.started_at)} — <b>{active.reviews}</b>
              <span className="text-subtle"> · {active.again}/{active.hard}/{active.good}/{active.easy}</span>
            </span>
          )}
        </div>

        {/* SVG */}
        <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="rune-chart-svg" role="img" aria-label={`Reviews per study session, ${points.length} sessions`} {...pointerProps}>

          {/* GRIDLINES + Y LABELS */}
          {[0, maxReviews / 2, maxReviews].map((value, i) => (
            <g key={i}>
              <line x1={plotLeft} y1={volumeY(value)} x2={plotRight} y2={volumeY(value)} style={{ stroke: C.grid }} strokeWidth="0.3" strokeOpacity={0.6} />
              <text x={plotLeft - 5} y={volumeY(value) + 3} textAnchor="end" style={{ fill: C.textDim, fontSize: 8 }}>{Math.round(value)}</text>
            </g>
          ))}

          {/* STACKED BARS — Again at the base through Easy on top, the same worst-to-best
              order the row list's rating bar uses. Each segment is trimmed by 1 unit so a
              sliver of surface separates it from the next; without the gap a two-tone stack
              reads as one block at these bar widths. */}
          {points.map((session, i) => {
            const cx = plotLeft + slot * (i + 0.5);
            const counts = [session.again, session.hard, session.good, session.easy];
            let cursor = 0;
            return (
              <g key={session.id} style={{ opacity: activeIndex == null || activeIndex === i ? 1 : 0.45 }}>
                {counts.map((count, segment) => {
                  if (count === 0) return null;
                  const yTop = volumeY(cursor + count);
                  const height = Math.max(0.6, volumeY(cursor) - yTop - 1);
                  cursor += count;
                  return (
                    <rect
                      key={segment}
                      x={cx - barWidth / 2}
                      y={yTop}
                      width={barWidth}
                      height={height}
                      style={{ fill: RATING_CHART_COLORS[RATING_SCALE[segment]] }}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* X LABELS — first and last session only; the table below carries the rest */}
          <text x={plotLeft + slot * 0.5} y={plotBottom + 13} textAnchor="middle" style={{ fill: C.textDim, fontSize: 8 }}>{shortLabel(points[0].started_at)}</text>
          <text x={plotLeft + slot * (points.length - 0.5)} y={plotBottom + 13} textAnchor="middle" style={{ fill: C.textDim, fontSize: 8 }}>{shortLabel(points[points.length - 1].started_at)}</text>
        </svg>

        {/* LEGEND — the stack's four segments named, so the rating a color stands for
            never has to be inferred from the color itself. */}
        <div className="rune-chart-legend">
          {RATING_SCALE.map((rating) => (
            <span key={rating} className="rune-chart-legend-item">
              <span className="rune-chart-swatch" style={{ background: RATING_CHART_COLORS[rating] }} />
              {ratingLabel(rating)}
            </span>
          ))}
        </div>
      </div>

      {/* ACCURACY CHART — share of each session's ratings that were Good or better */}
      <div className="rune-chart">

        {/* CHART HEADER */}
        <div className="rune-chart-head">

          {/* TITLE */}
          <span className="rune-chart-title">Accuracy per session</span>

          {/* ACTIVE READOUT */}
          {active && activeAccuracy != null && (
            <span className="rune-chart-readout">
              {shortLabel(active.started_at)} — <b>{Math.round(activeAccuracy)}%</b>
              <span className="text-subtle"> · {active.correct}/{active.reviews}</span>
            </span>
          )}
        </div>

        {/* SVG */}
        <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="rune-chart-svg" role="img" aria-label={`Accuracy per study session, ${points.length} sessions`} {...pointerProps}>

          {/* GRIDLINES + Y LABELS — the full 0-100 scale */}
          {[0, 50, 100].map((value) => (
            <g key={value}>
              <line x1={plotLeft} y1={accuracyY(value)} x2={plotRight} y2={accuracyY(value)} style={{ stroke: C.grid }} strokeWidth="0.3" strokeOpacity={0.6} />
              <text x={plotLeft - 5} y={accuracyY(value) + 3} textAnchor="end" style={{ fill: C.textDim, fontSize: 8 }}>{value}</text>
            </g>
          ))}

          {/* MEAN REFERENCE — the window's average, so a session reads as above or
              below your own norm rather than against an abstract 100%. */}
          <line x1={plotLeft} y1={accuracyY(meanAccuracy)} x2={plotRight} y2={accuracyY(meanAccuracy)} style={{ stroke: C.mean }} strokeWidth="0.8" strokeDasharray="3,3" strokeOpacity={0.85} />


          {/* TREND LINE */}
          <path d={linePath} fill="none" style={{ stroke: C.line }} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />

          {/* MEAN LABEL — drawn after the trend line, not before it: SVG paints in
              document order, so a surface patch placed earlier is simply covered by the
              line it was meant to sit above. */}
          <rect x={plotRight - 37} y={accuracyY(meanAccuracy) - 10.5} width={37} height={10} style={{ fill: C.surface }} />
          <text x={plotRight} y={accuracyY(meanAccuracy) - 3} textAnchor="end" style={{ fill: C.mean, fontSize: 7.5, fontWeight: 600 }}>Avg {Math.round(meanAccuracy)}%</text>

          {/* ACTIVE MARKER — a dot only where the pointer is; one on every session
              would be a wall of dots at 40 sessions. */}
          {activeIndex != null && activeAccuracy != null && (
            <circle cx={plotLeft + slot * (activeIndex + 0.5)} cy={accuracyY(activeAccuracy)} r={4} style={{ fill: C.line }} />
          )}

          {/* X LABELS */}
          <text x={plotLeft + slot * 0.5} y={plotBottom + 13} textAnchor="middle" style={{ fill: C.textDim, fontSize: 8 }}>{shortLabel(points[0].started_at)}</text>
          <text x={plotLeft + slot * (points.length - 0.5)} y={plotBottom + 13} textAnchor="middle" style={{ fill: C.textDim, fontSize: 8 }}>{shortLabel(points[points.length - 1].started_at)}</text>
        </svg>
      </div>
    </div>
  );
}
