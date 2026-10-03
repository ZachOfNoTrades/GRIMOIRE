"use client";

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

// ALIGN A PICTURE — the picture sits under the map's grid and outlines; drag it to move, scroll or
// use the slider to resize it, or snap it to the map with Fill, Fit or Stretch.
export default function PictureAligner({ url, width, height, features, rect, onChange }: PictureAlignerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [aspect, setAspect] = useState(0); // the picture's own shape, once it has loaded
  const current: PictureRect = rect ?? { x: 0, y: 0, w: width, h: height };

  useEffect(() => {
    const image = new window.Image();
    image.onload = () => setAspect(image.naturalWidth / Math.max(1, image.naturalHeight));
    image.src = url;
  }, [url]);

  const padX = width * 0.25;
  const padY = height * 0.25;
  const zoomPercent = Math.round((current.w / width) * 100);

  function toMap(clientX: number, clientY: number): { x: number; y: number } | null {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  // Wheel zoom is registered by hand so it can stop the page from scrolling.
  const currentRef = useRef(current);
  currentRef.current = current;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      const factor = Math.exp(-event.deltaY * 0.0015);
      const next = zoomRect(currentRef.current, factor, point.x, point.y);
      const percent = (next.w / width) * 100;
      if (percent < ZOOM_MIN || percent > ZOOM_MAX) return;
      onChangeRef.current(next);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [width]);

  function setZoom(percent: number) {
    const factor = (percent / 100 / (current.w / width)) || 1;
    onChange(zoomRect(current, factor, current.x + current.w / 2, current.y + current.h / 2));
  }

  return (
    <div className="orc-aligner">

      {/* PREVIEW */}
      <svg
        ref={svgRef}
        className="orc-aligner-svg"
        viewBox={`${-padX} ${-padY} ${width + padX * 2} ${height + padY * 2}`}
        role="img"
        aria-label="The picture under the map grid. Drag to move it."
        onPointerDown={(event) => {
          const point = toMap(event.clientX, event.clientY);
          if (!point) return;
          (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
          dragRef.current = { pointerId: event.pointerId, x: point.x, y: point.y };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const point = toMap(event.clientX, event.clientY);
          if (!point) return;
          onChange({ ...current, x: current.x + point.x - drag.x, y: current.y + point.y - drag.y });
          dragRef.current = { ...drag, x: point.x, y: point.y };
        }}
        onPointerUp={() => (dragRef.current = null)}
        onPointerCancel={() => (dragRef.current = null)}
      >
        <rect className="orc-aligner-ground" x={-padX} y={-padY} width={width + padX * 2} height={height + padY * 2} />
        <image href={url} x={current.x} y={current.y} width={current.w} height={current.h} preserveAspectRatio="none" />

        {/* THE MAP — its edge, grid and outlines */}
        <g className="orc-aligner-map" pointerEvents="none">
          {Array.from({ length: Math.floor(width / MAP_GRID) + 1 }, (_, index) => (
            <line key={`v${index}`} x1={index * MAP_GRID} y1={0} x2={index * MAP_GRID} y2={height} />
          ))}
          {Array.from({ length: Math.floor(height / MAP_GRID) + 1 }, (_, index) => (
            <line key={`h${index}`} x1={0} y1={index * MAP_GRID} x2={width} y2={index * MAP_GRID} />
          ))}
          {features.map((feature) => (
            <rect key={feature.id} className="orc-aligner-feature" x={feature.x} y={feature.y} width={feature.w} height={feature.h} />
          ))}
          <rect className="orc-aligner-edge" x={0} y={0} width={width} height={height} />
        </g>
      </svg>

      {/* CONTROLS */}
      <div className="orc-aligner-controls">
        <Button className="btn-off" onClick={() => onChange(fitRect(width, height, aspect, "fill"))} title="Cover the map, cropping the overflow">Fill</Button>
        <Button className="btn-off" onClick={() => onChange(fitRect(width, height, aspect, "fit"))} title="Show the whole picture inside the map">Fit</Button>
        <Button className="btn-off" onClick={() => onChange(fitRect(width, height, aspect, "stretch"))} title="Stretch to the map's shape">Stretch</Button>
        <label className="orc-aligner-zoom">
          <span className="orc-label">Size</span>
          <input type="range" min={ZOOM_MIN} max={400} value={Math.min(400, zoomPercent)} aria-label="Picture size" onChange={(event) => setZoom(Number(event.target.value))} />
          <RangeValue value={zoomPercent} min={ZOOM_MIN} max={ZOOM_MAX} suffix="%" label="Picture size" onCommit={setZoom} />
        </label>
      </div>
    </div>
  );
}
