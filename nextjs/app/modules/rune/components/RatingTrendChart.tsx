"use client";

import { useState } from "react";
import { CardReview } from "../types/card";
import { RATING_SCALE, RATING_CHART_COLORS, ratingLabel } from "../lib/rating";

// Color tokens — CSS custom properties only, no hardcoded colors.
const C = {
  textDim: "var(--color-gray)",
  grid: "var(--card-border)",
  link: "var(--card-border)",
};

// ─── Chart layout ───────────────────────────────────────────
const VIEW_WIDTH = 400;
const PAD = { top: 12, right: 14, bottom: 20, left: 42 };

function shortLabel(date: Date | string): string {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface RatingTrendChartProps {
  // Reviews as the API returns them (newest first); plotted oldest-first.
  reviews: CardReview[];
  // Compact drops the height and the date ticks for the deck row's inline strip,
  // where the chart is a glance rather than something to read off.
  compact?: boolean;
}

// RATING TREND — one card's recall history. The y axis IS the rating (Again at the
// floor, Easy at the ceiling) and it is labelled, so the trajectory is legible
// without reading the colors at all; the dots are colored to match the rating
// buttons and the deck history's bars.
//
// The x axis is real elapsed time, not review number, which is the point: as a card
// is learned its reviews spread out, so a healthy card's dots drift apart to the
// right. Evenly spacing them would hide exactly that.
export default function RatingTrendChart({ reviews, compact = false }: RatingTrendChartProps) {

  // STATE — index of the hovered/tapped review (null when not interacting).
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // A trajectory needs at least two reviews.
  const points = [...reviews].reverse();
  if (points.length < 2) return null;

  const viewHeight = compact ? 84 : 132;
  const plotLeft = PAD.left;
  const plotRight = VIEW_WIDTH - PAD.right;
  const plotTop = PAD.top;
  const plotBottom = viewHeight - (compact ? 10 : PAD.bottom);
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  // X scale — elapsed time across the whole history. A card reviewed twice in one
  // session has a zero span, so fall back to even spacing rather than dividing by 0.
  const times = points.map((review) => new Date(review.created_at).getTime());
  const firstTime = times[0];
  const span = times[times.length - 1] - firstTime;
  const xFor = (index: number) =>
    span > 0
      ? plotLeft + ((times[index] - firstTime) / span) * plotWidth
      : plotLeft + (plotWidth / Math.max(1, points.length - 1)) * index;

  // Y scale — the four rating steps, evenly spaced, worst at the bottom.
  const yFor = (rating: number) => plotBottom - ((rating - 1) / 3) * plotHeight;

  // Nearest review to a pointer x (in client px), mapped into viewBox space.
  const findNearest = (clientX: number, svg: SVGSVGElement): number => {
    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * VIEW_WIDTH;
    let nearest = 0;
    let bestDistance = Infinity;
    points.forEach((_, index) => {
      const distance = Math.abs(xFor(index) - svgX);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = index;
      }
    });
    return nearest;
  };

  const active = activeIndex != null ? points[activeIndex] : null;

  return (

    /* RATING TREND CHART */
    <div className="rune-chart">

      {/* CHART HEADER — title + hovered-review readout */}
      <div className="rune-chart-head">

        {/* TITLE */}
        <span className="rune-chart-title">Recall over time</span>

        {/* ACTIVE READOUT */}
        {active && (
          <span className="rune-chart-readout">
            {shortLabel(active.created_at)} — <b>{ratingLabel(active.rating)}</b>
            {active.response_time_ms != null && (
              <span className="text-subtle"> · {(active.response_time_ms / 1000).toFixed(1)}s</span>
            )}
          </span>
        )}
      </div>

      {/* SVG */}
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${viewHeight}`}
        className="rune-chart-svg"
        role="img"
        aria-label={`Rating history, ${points.length} reviews from ${ratingLabel(points[0].rating)} to ${ratingLabel(points[points.length - 1].rating)}`}
        onMouseMove={(e) => setActiveIndex(findNearest(e.clientX, e.currentTarget))}
        onMouseLeave={() => setActiveIndex(null)}
        onTouchStart={(e) => setActiveIndex(findNearest(e.touches[0].clientX, e.currentTarget))}
        onTouchMove={(e) => setActiveIndex(findNearest(e.touches[0].clientX, e.currentTarget))}
        onTouchEnd={() => setActiveIndex(null)}
      >

        {/* RATING GRIDLINES + LABELS — the axis names each step, so the chart is
            readable with no reference to its colors. */}
        {RATING_SCALE.map((rating) => (
          <g key={rating}>
            <line x1={plotLeft} y1={yFor(rating)} x2={plotRight} y2={yFor(rating)} style={{ stroke: C.grid }} strokeWidth="0.3" strokeOpacity={0.6} />
            <text x={plotLeft - 5} y={yFor(rating) + 3} textAnchor="end" style={{ fill: C.textDim, fontSize: 8 }}>{ratingLabel(rating)}</text>
          </g>
        ))}

        {/* CONNECTOR — a recessive thread through the ratings in order; the dots are
            the data, this only says which order they came in. */}
        <path
          d={points.map((review, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(review.rating)}`).join(" ")}
          fill="none"
          style={{ stroke: C.link }}
          strokeWidth="1"
          strokeLinejoin="round"
        />

        {/* REVIEW DOTS */}
        {points.map((review, i) => (
          <circle
            key={review.id}
            cx={xFor(i)}
            cy={yFor(review.rating)}
            r={activeIndex === i ? 4.5 : 3.2}
            style={{ fill: RATING_CHART_COLORS[review.rating], opacity: activeIndex == null || activeIndex === i ? 1 : 0.45 }}
          />
        ))}

        {/* X LABELS — first and last review; dropped in the compact strip */}
        {!compact && (
          <>
            <text x={plotLeft} y={plotBottom + 13} textAnchor="start" style={{ fill: C.textDim, fontSize: 8 }}>{shortLabel(points[0].created_at)}</text>
            <text x={plotRight} y={plotBottom + 13} textAnchor="end" style={{ fill: C.textDim, fontSize: 8 }}>{shortLabel(points[points.length - 1].created_at)}</text>
          </>
        )}
      </svg>
    </div>
  );
}
