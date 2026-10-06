"use client";

import { Crosshair, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { fitRect, zoomRect } from "../lib/mapData";
import { MAP_GRID } from "../lib/constants";
import type { MapFeature, PictureRect } from "../types/oracle";
import RangeValue from "./RangeValue";

interface PictureAlignerProps {
  url: string;
  width: number; // the map's size in map units
  height: number;
  features: MapFeature[];
  rect: PictureRect | null; // null: stretched over the whole map
  onChange: (rect: PictureRect) => void;
}

const ZOOM_MIN = 10;
const ZOOM_MAX = 1000;
const MAJOR = 5; // every fifth line is heavier
const COLUMN_NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

type Point = { x: number; y: number };

// GRID — drawn twice, a dark line under a light one, so it reads over any picture. Every fifth
// line is heavier, and the edges carry column letters and row numbers to talk about a spot by.
function Grid({ width, height, features, scale }: { width: number; height: number; features: MapFeature[]; scale: number }) {
  const columns = Math.floor(width / MAP_GRID);
  const rows = Math.floor(height / MAP_GRID);
  const label = Math.max(9, 11 / scale);
  const lines: { key: string; x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
  for (let c = 0; c <= columns; c += 1) lines.push({ key: `v${c}`, x1: c * MAP_GRID, y1: 0, x2: c * MAP_GRID, y2: height, major: c % MAJOR === 0 });
  for (let r = 0; r <= rows; r += 1) lines.push({ key: `h${r}`, x1: 0, y1: r * MAP_GRID, x2: width, y2: r * MAP_GRID, major: r % MAJOR === 0 });
  return (
    <g className="orc-aligner-map" pointerEvents="none">
      {lines.map((line) => <line key={`u${line.key}`} className="orc-aligner-under" data-major={line.major ? "true" : undefined} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />)}
      {lines.map((line) => <line key={line.key} className="orc-aligner-line" data-major={line.major ? "true" : undefined} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />)}
      {features.map((feature) => (
        <rect key={feature.id} className="orc-aligner-feature" x={feature.x} y={feature.y} width={feature.w} height={feature.h} />
      ))}
      <rect className="orc-aligner-edge" x={0} y={0} width={width} height={height} />
      {Array.from({ length: columns }, (_, c) => (
        <text key={`c${c}`} className="orc-aligner-label" x={c * MAP_GRID + MAP_GRID / 2} y={-label * 0.45} fontSize={label} textAnchor="middle">{COLUMN_NAMES[c % 26]}</text>
      ))}
      {Array.from({ length: rows }, (_, r) => (
        <text key={`r${r}`} className="orc-aligner-label" x={-label * 0.45} y={r * MAP_GRID + MAP_GRID / 2 + label * 0.35} fontSize={label} textAnchor="end">{r + 1}</text>
      ))}
    </g>
  );
}

// ALIGN A PICTURE — two ways:
//   • by hand: the picture sits under the grid; drag it, scroll or use the size control to resize it,
//     or snap it with Fill, Fit and Stretch.
//   • by points: pick a spot on the grid, then the same spot on the picture, twice. The picture is
//     then moved and sized so each pair lands together (its own shape is kept).
export default function PictureAligner({ url, width, height, features, rect, onChange }: PictureAlignerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gridRef = useRef<SVGSVGElement>(null);
  const picRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [aspect, setAspect] = useState(0); // the picture's own shape, once it has loaded
  const [isMatching, setIsMatching] = useState(false);
  const [gridPoints, setGridPoints] = useState<Point[]>([]); // on the map, in map units
  const [picPoints, setPicPoints] = useState<Point[]>([]); // on the picture, 0..1 each way
  const current: PictureRect = rect ?? { x: 0, y: 0, w: width, h: height };

  useEffect(() => {
    const image = new window.Image();
    image.onload = () => setAspect(image.naturalWidth / Math.max(1, image.naturalHeight));
    image.src = url;
  }, [url]);

  const padX = width * 0.25;
  const padY = height * 0.25;
  const zoomPercent = Math.round((current.w / width) * 100);
  const viewScale = 1; // the overlay preview is at most the map's size across; labels use a floor

  function toPoint(svg: SVGSVGElement | null, clientX: number, clientY: number): Point | null {
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  // No wheel zoom: a scroll over the picture scrolls the page, so it can never nudge the picture
  // off the grid by accident. Size changes only through the size control and Fill/Fit/Stretch.

  function setZoom(percent: number) {
    const factor = percent / 100 / (current.w / width) || 1;
    onChange(zoomRect(current, factor, current.x + current.w / 2, current.y + current.h / 2));
  }

  // MATCHING — the order of clicks is grid, picture, grid, picture.
  const step = gridPoints.length + picPoints.length; // 0..3, then done
  const expectGrid = step === 0 || step === 2;

  function startMatching() {
    setGridPoints([]);
    setPicPoints([]);
    setIsMatching(true);
  }

  function stopMatching() {
    setIsMatching(false);
    setGridPoints([]);
    setPicPoints([]);
  }

  function clickGrid(event: React.PointerEvent<SVGSVGElement>) {
    if (!expectGrid) return;
    const point = toPoint(gridRef.current, event.clientX, event.clientY);
    if (!point || point.x < 0 || point.y < 0 || point.x > width || point.y > height) return;
    setGridPoints((list) => [...list, point]);
  }

  function clickPicture(event: React.PointerEvent<SVGSVGElement>) {
    if (expectGrid) return;
    const point = toPoint(picRef.current, event.clientX, event.clientY);
    const box = aspect > 0 ? { w: aspect, h: 1 } : null;
    if (!point || !box || point.x < 0 || point.y < 0 || point.x > box.w || point.y > box.h) return;
    const normal = { x: point.x / box.w, y: point.y / box.h };
    const nextPics = [...picPoints, normal];
    setPicPoints(nextPics);
    if (nextPics.length === 2 && gridPoints.length === 2) {
      // Size so the two picture points are as far apart, in map units, as their grid points; the
      // picture keeps its own shape. Then place it so the pairs' midpoints coincide.
      const [ma, mb] = gridPoints;
      const [pa, pb] = nextPics;
      const mapDistance = Math.hypot(mb.x - ma.x, mb.y - ma.y);
      const picDistance = Math.hypot((pb.x - pa.x) * aspect, pb.y - pa.y);
      if (picDistance > 0.01 && mapDistance > 1) {
        const h = mapDistance / picDistance;
        const w = h * aspect;
        const x = (ma.x + mb.x) / 2 - ((pa.x + pb.x) / 2) * w;
        const y = (ma.y + mb.y) / 2 - ((pa.y + pb.y) / 2) * h;
        onChange({ x, y, w, h });
      }
      stopMatching();
    }
  }

  const prompts = ["Click a point on the grid", "Click the same point on the picture", "Click a second point on the grid", "Click the same point on the picture"];
  const markerSize = Math.max(8, width / 70);

  return (
    <div className="orc-aligner">

      {/* PREVIEW — the picture under the grid, or the grid beside the picture while matching points */}
      {!isMatching && (
        <svg
          ref={svgRef}
          className="orc-aligner-svg"
          viewBox={`${-padX} ${-padY} ${width + padX * 2} ${height + padY * 2}`}
          role="img"
          aria-label="The picture under the map grid. Drag to move it."
          onPointerDown={(event) => {
            const point = toPoint(svgRef.current, event.clientX, event.clientY);
            if (!point) return;
            (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
            dragRef.current = { pointerId: event.pointerId, x: point.x, y: point.y };
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            const point = toPoint(svgRef.current, event.clientX, event.clientY);
            if (!point) return;
            onChange({ ...current, x: current.x + point.x - drag.x, y: current.y + point.y - drag.y });
            dragRef.current = { ...drag, x: point.x, y: point.y };
          }}
          onPointerUp={() => (dragRef.current = null)}
          onPointerCancel={() => (dragRef.current = null)}
        >
          <rect className="orc-aligner-ground" x={-padX} y={-padY} width={width + padX * 2} height={height + padY * 2} />
          <image href={url} x={current.x} y={current.y} width={current.w} height={current.h} preserveAspectRatio="none" />
          <Grid width={width} height={height} features={features} scale={viewScale} />
        </svg>
      )}

      {isMatching && (
        <div className="orc-aligner-pair">
          <div className="orc-aligner-pane" data-active={expectGrid ? "true" : undefined}>
            <span className="orc-label">Grid</span>
            <svg ref={gridRef} className="orc-aligner-svg orc-aligner-pick" viewBox={`${-padX / 2} ${-padY / 2} ${width + padX} ${height + padY}`} role="img" aria-label="The map grid. Click a point." onPointerDown={clickGrid}>
              <rect className="orc-aligner-ground" x={-padX / 2} y={-padY / 2} width={width + padX} height={height + padY} />
              <Grid width={width} height={height} features={features} scale={1} />
              {gridPoints.map((point, index) => (
                <g key={index} className="orc-aligner-marker" pointerEvents="none">
                  <circle cx={point.x} cy={point.y} r={markerSize} />
                  <text x={point.x + markerSize * 1.3} y={point.y - markerSize * 1.1} fontSize={markerSize * 2}>{index + 1}</text>
                </g>
              ))}
            </svg>
          </div>
          <div className="orc-aligner-pane" data-active={!expectGrid ? "true" : undefined}>
            <span className="orc-label">Picture</span>
            <svg ref={picRef} className="orc-aligner-svg orc-aligner-pick" viewBox={`0 0 ${aspect || 1.5} 1`} role="img" aria-label="The picture. Click the matching point." onPointerDown={clickPicture}>
              <image href={url} x={0} y={0} width={aspect || 1.5} height={1} preserveAspectRatio="none" />
              {picPoints.map((point, index) => (
                <g key={index} className="orc-aligner-marker" pointerEvents="none">
                  <circle cx={point.x * (aspect || 1.5)} cy={point.y} r={0.012} />
                  <text x={point.x * (aspect || 1.5) + 0.02} y={point.y - 0.02} fontSize={0.04}>{index + 1}</text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      )}

      {/* CONTROLS */}
      <div className="orc-aligner-controls">
        {!isMatching ? (
          <>
            <Button className="btn-off" onClick={startMatching} title="Pair two spots on the grid with the same two spots on the picture">
              <Crosshair className="w-4 h-4" /> Match points
            </Button>
            <Button className="btn-off" onClick={() => onChange(fitRect(width, height, aspect, "fill"))} title="Cover the map, cropping the overflow">Fill</Button>
            <Button className="btn-off" onClick={() => onChange(fitRect(width, height, aspect, "fit"))} title="Show the whole picture inside the map">Fit</Button>
            <Button className="btn-off" onClick={() => onChange(fitRect(width, height, aspect, "stretch"))} title="Stretch to the map's shape">Stretch</Button>
            <label className="orc-aligner-zoom">
              <span className="orc-label">Size</span>
              <input type="range" min={ZOOM_MIN} max={400} value={Math.min(400, zoomPercent)} aria-label="Picture size" onChange={(event) => setZoom(Number(event.target.value))} />
              <RangeValue value={zoomPercent} min={ZOOM_MIN} max={ZOOM_MAX} suffix="%" label="Picture size" onCommit={setZoom} />
            </label>
          </>
        ) : (
          <>
            <span className="orc-aligner-prompt" role="status">{step < 4 ? `${Math.floor(step / 2) + 1} of 2 · ${prompts[step]}` : ""}</span>
            <Button className="btn-off" onClick={stopMatching}><X className="w-4 h-4" /> Cancel</Button>
          </>
        )}
      </div>
    </div>
  );
}
