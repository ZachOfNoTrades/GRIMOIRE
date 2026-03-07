"use client"

import { useState, useId } from "react";

export interface ChartDataPoint {
  date: Date;
  dateLabel: string;
  estimatedOneRepMax: number;
}

interface ProgressionChartProps {
  dataPoints: ChartDataPoint[];
}

// ─── Chart Layout Constants ─────────────────────────────────
const VIEW_WIDTH = 400;
const VIEW_HEIGHT = 200;
const CHART_PADDING = { top: 22, right: 16, bottom: 28, left: 44 };

// ─── Types ──────────────────────────────────────────────────

interface ChartPoint {
  x: number;
  y: number;
}

interface ChartSegment {
  type: "solid" | "gap";
  startIndex: number;
  endIndex: number;
}

// ─── Monotone Cubic Interpolation (Fritsch-Carlson) ─────────

function generateSmoothPath(points: ChartPoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  const n = points.length;

  // Step 1: Compute slopes between consecutive points
  const deltas: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    deltas.push(points[i + 1].x - points[i].x);
    slopes.push((points[i + 1].y - points[i].y) / deltas[i]);
  }

  // Step 2: Compute tangents with Fritsch-Carlson method
  const tangents: number[] = new Array(n);

  // Endpoints: one-sided slopes
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];

  // Interior points
  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      // Local extremum — set tangent to 0
      tangents[i] = 0;
    } else {
      // Average of adjacent slopes
      tangents[i] = (slopes[i - 1] + slopes[i]) / 2;
    }
  }

  // Step 3: Adjust tangents for monotonicity (alpha/beta circle check)
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const alpha = tangents[i] / slopes[i];
    const beta = tangents[i + 1] / slopes[i];
    const magnitude = alpha * alpha + beta * beta;
    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude);
      tangents[i] = scale * alpha * slopes[i];
      tangents[i + 1] = scale * beta * slopes[i];
    }
  }

  // Step 4: Convert to cubic Bezier control points
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = deltas[i] / 3;
    const cp1x = points[i].x + dx;
    const cp1y = points[i].y + tangents[i] * dx;
    const cp2x = points[i + 1].x - dx;
    const cp2y = points[i + 1].y - tangents[i + 1] * dx;
    path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${points[i + 1].x},${points[i + 1].y}`;
  }

  return path;
}

// ─── Gap Detection for Sparse Data ─────────────────────────

function detectGapSegments(dataPoints: ChartDataPoint[], chartPoints: ChartPoint[]): ChartSegment[] {
  const n = dataPoints.length;
  if (n < 3) {
    // With < 3 data points, no meaningful gap detection
    return [{ type: "solid", startIndex: 0, endIndex: n - 1 }];
  }

  // Compute time intervals
  const intervals: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    intervals.push(dataPoints[i + 1].date.getTime() - dataPoints[i].date.getTime());
  }

  // Compute median interval
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const medianInterval = sortedIntervals[Math.floor(sortedIntervals.length / 2)];
  const gapThreshold = 2 * medianInterval;

  // Build segments
  const segments: ChartSegment[] = [];
  let solidStart = 0;

  for (let i = 0; i < intervals.length; i++) {
    if (intervals[i] > gapThreshold) {
      // Close current solid segment
      segments.push({ type: "solid", startIndex: solidStart, endIndex: i });
      // Add gap segment
      segments.push({ type: "gap", startIndex: i, endIndex: i + 1 });
      // Start new solid segment
      solidStart = i + 1;
    }
  }

  // Close final solid segment
  segments.push({ type: "solid", startIndex: solidStart, endIndex: n - 1 });

  return segments;
}

// ─── Adaptive X-Axis Labels ─────────────────────────────────

function selectAxisLabels(dataPoints: ChartDataPoint[], chartPoints: ChartPoint[]): number[] {
  const n = dataPoints.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  if (n === 2) return [0, 1];

  const lastIndex = n - 1;

  // Estimate label width in SVG units
  const estimateLabelWidth = (index: number) => dataPoints[index].dateLabel.length * 5;
  const minGap = 8;

  // Guaranteed: first and last
  const lastLabelWidth = estimateLabelWidth(lastIndex);
  const lastLabelLeft = chartPoints[lastIndex].x - lastLabelWidth / 2;

  const selected: number[] = [0];
  let previousRight = chartPoints[0].x + estimateLabelWidth(0) / 2;

  // Greedy left-to-right through candidates (skip first and last)
  for (let i = 1; i < lastIndex; i++) {
    const labelWidth = estimateLabelWidth(i);
    const labelLeft = chartPoints[i].x - labelWidth / 2;
    const labelRight = chartPoints[i].x + labelWidth / 2;

    // Check overlap with previous selected label
    if (labelLeft < previousRight + minGap) continue;

    // Check overlap with guaranteed last label
    if (labelRight + minGap > lastLabelLeft) continue;

    selected.push(i);
    previousRight = labelRight;
  }

  selected.push(lastIndex);

  // Cap at 6 labels — thin evenly if exceeded
  if (selected.length > 6) {
    const thinned: number[] = [selected[0]];
    const innerCount = Math.min(4, selected.length - 2);
    for (let i = 0; i < innerCount; i++) {
      const targetIndex = Math.round(((i + 1) / (innerCount + 1)) * (selected.length - 1));
      thinned.push(selected[targetIndex]);
    }
    thinned.push(selected[selected.length - 1]);
    return thinned;
  }

  return selected;
}

// ─── SVG Tooltip ────────────────────────────────────────────

function ChartTooltip({ point, dataPoint, plotTop, plotLeft, plotRight }: {
  point: ChartPoint;
  dataPoint: ChartDataPoint;
  plotTop: number;
  plotLeft: number;
  plotRight: number;
}) {
  const valueText = `${dataPoint.estimatedOneRepMax} lbs`;
  const dateText = dataPoint.dateLabel;

  const tooltipWidth = Math.max(valueText.length, dateText.length) * 6.5 + 16;
  const tooltipHeight = 32;
  const tooltipGap = 10;

  // Position above point; flip below if too close to top
  const aboveTop = point.y - tooltipGap - tooltipHeight;
  const flipped = aboveTop < plotTop - 5;
  const tooltipY = flipped ? point.y + tooltipGap : aboveTop;

  // Clamp horizontally within plot bounds
  let tooltipX = point.x - tooltipWidth / 2;
  tooltipX = Math.max(plotLeft, Math.min(tooltipX, plotRight - tooltipWidth));

  return (
    <g>
      {/* TOOLTIP BACKGROUND */}
      <rect
        x={tooltipX}
        y={tooltipY}
        width={tooltipWidth}
        height={tooltipHeight}
        rx={4}
        style={{ fill: "var(--card-bg)", stroke: "var(--card-border)" }}
        strokeWidth={0.5}
      />

      {/* TOOLTIP VALUE */}
      <text
        x={tooltipX + tooltipWidth / 2}
        y={tooltipY + 13}
        textAnchor="middle"
        style={{ fill: "var(--color-primary)", fontSize: 10, fontWeight: 600 }}
      >
        {valueText}
      </text>

      {/* TOOLTIP DATE */}
      <text
        x={tooltipX + tooltipWidth / 2}
        y={tooltipY + 25}
        textAnchor="middle"
        style={{ fill: "var(--color-muted)", fontSize: 8 }}
      >
        {dateText}
      </text>
    </g>
  );
}

// ─── ProgressionChart Component ─────────────────────────────

export default function ProgressionChart({ dataPoints }: ProgressionChartProps) {

  // STATE
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const gradientId = useId();

  if (dataPoints.length < 2) return null;

  // Y-axis bounds with padding
  const values = dataPoints.map((point) => point.estimatedOneRepMax);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;
  const yAxisPadding = Math.max(valueRange * 0.15, 5);
  const yMin = Math.floor(minValue - yAxisPadding);
  const yMax = Math.ceil(maxValue + yAxisPadding);
  const yRange = yMax - yMin;

  // X-axis bounds from time
  const timeStart = dataPoints[0].date.getTime();
  const timeEnd = dataPoints[dataPoints.length - 1].date.getTime();
  const timeRange = timeEnd - timeStart || 1;

  // Plot area edges
  const plotLeft = CHART_PADDING.left;
  const plotRight = VIEW_WIDTH - CHART_PADDING.right;
  const plotTop = CHART_PADDING.top;
  const plotBottom = VIEW_HEIGHT - CHART_PADDING.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  // Map data to SVG coordinates
  const chartPoints: ChartPoint[] = dataPoints.map((point) => ({
    x: plotLeft + ((point.date.getTime() - timeStart) / timeRange) * plotWidth,
    y: plotTop + ((yMax - point.estimatedOneRepMax) / yRange) * plotHeight,
  }));

  // Gap detection
  const segments = detectGapSegments(dataPoints, chartPoints);

  // Adaptive x-axis labels
  const labelIndices = selectAxisLabels(dataPoints, chartPoints);

  // Horizontal grid lines (4 divisions)
  const gridLineCount = 4;
  const gridStepValue = yRange / gridLineCount;
  const gridLines = Array.from({ length: gridLineCount + 1 }, (_, index) => {
    const value = yMin + index * gridStepValue;
    return { label: Math.round(value), y: plotTop + ((yMax - value) / yRange) * plotHeight };
  });

  // Find nearest data point to cursor x-position
  const findNearestIndex = (clientX: number, svgElement: SVGSVGElement): number => {
    const boundingRect = svgElement.getBoundingClientRect();
    const svgX = ((clientX - boundingRect.left) / boundingRect.width) * VIEW_WIDTH;
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    chartPoints.forEach((point, index) => {
      const distance = Math.abs(point.x - svgX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    return nearestIndex;
  };

  const hoveredPoint = hoveredIndex !== null ? dataPoints[hoveredIndex] : null;

  return (
    <div className="stat-card">

      {/* CHART HEADER */}
      <div className="flex items-baseline justify-between mb-2">

        {/* CHART TITLE */}
        <p className="stat-label">e1RM Progression</p>

        {/* HOVERED POINT DETAIL */}
        {hoveredPoint && (
          <p className="text-sm text-secondary">
            {hoveredPoint.dateLabel} — <span className="font-semibold text-primary">{hoveredPoint.estimatedOneRepMax} lbs</span>
          </p>
        )}
      </div>

      {/* SVG CHART */}
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="w-full"
        onMouseMove={(event) => setHoveredIndex(findNearestIndex(event.clientX, event.currentTarget))}
        onMouseLeave={() => setHoveredIndex(null)}
        onTouchMove={(event) => setHoveredIndex(findNearestIndex(event.touches[0].clientX, event.currentTarget))}
        onTouchEnd={() => setHoveredIndex(null)}
      >
        <defs>
          {/* AREA FILL GRADIENT */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--btn-primary-bg)", stopOpacity: 0.25 }} />
            <stop offset="100%" style={{ stopColor: "var(--btn-primary-bg)", stopOpacity: 0.05 }} />
          </linearGradient>
        </defs>

        {/* HORIZONTAL GRID LINES + Y-AXIS LABELS */}
        {gridLines.map((gridLine, index) => (
          <g key={index}>
            <line x1={plotLeft} y1={gridLine.y} x2={plotRight} y2={gridLine.y} style={{ stroke: "var(--card-border)" }} strokeWidth="0.3" strokeOpacity={0.6} />
            <text x={plotLeft - 6} y={gridLine.y + 3} textAnchor="end" style={{ fill: "var(--color-muted)", fontSize: 9 }}>{gridLine.label}</text>
          </g>
        ))}

        {/* Y-AXIS UNIT LABEL */}
        <text x={plotLeft - 6} y={plotTop - 8} textAnchor="end" style={{ fill: "var(--color-muted)", fontSize: 8, fontStyle: "italic" }}>lbs</text>

        {/* X-AXIS DATE LABELS */}
        {labelIndices.map((dataIndex) => (
          <text key={dataIndex} x={chartPoints[dataIndex].x} y={plotBottom + 16} textAnchor="middle" style={{ fill: "var(--color-muted)", fontSize: 9 }}>
            {dataPoints[dataIndex].dateLabel}
          </text>
        ))}

        {/* SEGMENTS: SOLID CURVES + GAP DASHES */}
        {segments.map((segment, segmentIndex) => {
          if (segment.type === "gap") {
            // Dashed line between gap endpoints
            const start = chartPoints[segment.startIndex];
            const end = chartPoints[segment.endIndex];
            return (
              <line
                key={`gap-${segmentIndex}`}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                style={{ stroke: "var(--color-muted)" }}
                strokeWidth="1.75"
                strokeDasharray="4,4"
                strokeOpacity={0.4}
                strokeLinecap="round"
              />
            );
          }

          // Solid segment
          const segmentPoints = chartPoints.slice(segment.startIndex, segment.endIndex + 1);

          // Single-point segments: just the dot (rendered below)
          if (segmentPoints.length < 2) return null;

          // Smooth curve path
          const linePath = generateSmoothPath(segmentPoints);

          // Area path: reuse smooth top edge, close along bottom
          const firstPoint = segmentPoints[0];
          const lastPoint = segmentPoints[segmentPoints.length - 1];
          const areaPath = `${linePath} L ${lastPoint.x} ${plotBottom} L ${firstPoint.x} ${plotBottom} Z`;

          return (
            <g key={`solid-${segmentIndex}`}>
              {/* AREA FILL */}
              <path d={areaPath} fill={`url(#${gradientId})`} />

              {/* LINE */}
              <path d={linePath} fill="none" style={{ stroke: "var(--btn-primary-bg)" }} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}

        {/* HOVER VERTICAL GUIDE LINE */}
        {hoveredIndex !== null && (
          <line
            x1={chartPoints[hoveredIndex].x}
            y1={plotTop}
            x2={chartPoints[hoveredIndex].x}
            y2={plotBottom}
            style={{ stroke: "var(--color-muted)" }}
            strokeWidth="0.5"
            strokeDasharray="3,3"
          />
        )}

        {/* DATA POINT DOTS */}
        {chartPoints.map((point, index) => {
          const isHovered = hoveredIndex === index;
          return (
            <g key={index}>
              {/* HOVER RING */}
              {isHovered && (
                <circle cx={point.x} cy={point.y} r={6} style={{ fill: "var(--card-bg)" }} />
              )}

              {/* DOT */}
              <circle
                cx={point.x}
                cy={point.y}
                r={isHovered ? 4 : 2.5}
                style={{ fill: "var(--btn-primary-bg)" }}
              />
            </g>
          );
        })}

        {/* SVG TOOLTIP */}
        {hoveredIndex !== null && (
          <ChartTooltip
            point={chartPoints[hoveredIndex]}
            dataPoint={dataPoints[hoveredIndex]}
            plotTop={plotTop}
            plotLeft={plotLeft}
            plotRight={plotRight}
          />
        )}
      </svg>
    </div>
  );
}
