"use client";

import { Circle, MousePointer2, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FEATURE_STATES, MAP_GRID, MAX_FEATURES } from "../lib/constants";
import { isOval } from "../lib/mapData";
import type { FeatureShape, FeatureState, FeatureType, MapFeature, PictureRect } from "../types/oracle";

interface FeatureEditorProps {
  width: number; // the map's size in map units
  height: number;
  features: MapFeature[];
  pictureUrl: string | null;
  pictureRect: PictureRect | null; // null: stretched over the whole map
  onChange: (features: MapFeature[], label: string, mergeKey: string) => void; // label names the step for the edit history
}

type Tool = "select" | FeatureShape;
type Point = { x: number; y: number };
type Gesture =
  | { kind: "draw"; pointerId: number; from: Point; to: Point }
  | { kind: "move"; pointerId: number; id: string; from: Point; origin: MapFeature }
  | { kind: "resize"; pointerId: number; id: string; from: Point; origin: MapFeature };

const TOOLS: { value: Tool; label: string }[] = [
  { value: "select", label: "Select" },
  { value: "rect", label: "Rectangle" },
  { value: "oval", label: "Oval" },
];

const TYPE_LABELS: Record<FeatureType, string> = { building: "Building", road: "Road", water: "Water", wall: "Wall", landmark: "Landmark" };
const STATE_LABELS: Record<FeatureState, string> = { intact: "Intact", burned: "Burned", ruined: "Ruined" };
const SHAPE_LABELS: Record<FeatureShape, string> = { rect: "Rectangle", oval: "Oval" };
const MIN_SIZE = 10; // map units; a smaller drag is treated as a click

// SHAPES — draw rectangles and ovals over the map's picture, then say what each one is (building,
// road, water, wall, landmark), name it and set its state. Move, resize and delete them. Everything snaps to the grid unless Snap is off. Changes
// go up through `onChange`; the page saves them with the rest of the map.
export default function FeatureEditor({ width, height, features, pictureUrl, pictureRect, onChange }: FeatureEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [isSnapping, setIsSnapping] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gesture, setGesture] = useState<Gesture | null>(null);

  const selected = features.find((feature) => feature.id === selectedId) ?? null; // null too once an undo removes it
  const picture = pictureRect ?? { x: 0, y: 0, w: width, h: height };
  const atLimit = features.length >= MAX_FEATURES;

  // Delete or Backspace removes the selected shape, unless a field has the keyboard.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!selectedId) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        remove(selectedId);
      } else if (event.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toPoint(clientX: number, clientY: number): Point | null {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  const snap = (value: number) => (isSnapping ? Math.round(value / MAP_GRID) * MAP_GRID : Math.round(value));
  const clampX = (value: number) => Math.min(width, Math.max(0, value));
  const clampY = (value: number) => Math.min(height, Math.max(0, value));

  // A step's name: the verb and the shape's own name when it has one ("Moved First Tower").
  function stepLabel(verb: string, feature: MapFeature | undefined) {
    return `${verb} ${feature?.name.trim() || "shape"}`;
  }

  function update(id: string, patch: Partial<MapFeature>, verb: string) {
    const next = features.map((feature) => (feature.id === id ? { ...feature, ...patch } : feature));
    onChange(next, stepLabel(verb, next.find((feature) => feature.id === id)), `${verb}|${id}`);
  }

  function remove(id: string) {
    onChange(features.filter((feature) => feature.id !== id), stepLabel("Deleted", features.find((feature) => feature.id === id)), `Deleted|${id}`);
    setSelectedId(null);
  }

  function newId(): string {
    const used = new Set(features.map((feature) => feature.id));
    let index = features.length + 1;
    while (used.has(`f${index}`)) index += 1;
    return `f${index}`;
  }

  // The rectangle a draw gesture covers, snapped and kept on the map.
  function drawnBox(from: Point, to: Point) {
    const x1 = clampX(snap(Math.min(from.x, to.x)));
    const y1 = clampY(snap(Math.min(from.y, to.y)));
    const x2 = clampX(snap(Math.max(from.x, to.x)));
    const y2 = clampY(snap(Math.max(from.y, to.y)));
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  // Where a moved or resized shape lands for the pointer at `point`.
  function transformed(active: Extract<Gesture, { kind: "move" | "resize" }>, point: Point): Partial<MapFeature> {
    const dx = point.x - active.from.x;
    const dy = point.y - active.from.y;
    const origin = active.origin;
    if (active.kind === "move") {
      return { x: Math.min(width - origin.w, Math.max(-origin.w / 2, snap(origin.x + dx))), y: Math.min(height - origin.h, Math.max(-origin.h / 2, snap(origin.y + dy))) };
    }
    return { w: Math.max(isSnapping ? MAP_GRID : MIN_SIZE, snap(origin.x + origin.w + dx) - origin.x), h: Math.max(isSnapping ? MAP_GRID : MIN_SIZE, snap(origin.y + origin.h + dy) - origin.y) };
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const point = toPoint(event.clientX, event.clientY);
    if (!point) return;
    const target = event.target as Element;
    const handle = target.closest("[data-handle]");
    const shape = target.closest("[data-feature-id]");
    if (tool === "select" || handle) {
      if (handle && selected) {
        event.currentTarget.setPointerCapture(event.pointerId);
        setGesture({ kind: "resize", pointerId: event.pointerId, id: selected.id, from: point, origin: selected });
        return;
      }
      const id = shape?.getAttribute("data-feature-id") ?? null;
      setSelectedId(id);
      const origin = features.find((feature) => feature.id === id);
      if (origin) {
        event.currentTarget.setPointerCapture(event.pointerId);
        setGesture({ kind: "move", pointerId: event.pointerId, id: origin.id, from: point, origin });
      }
      return;
    }
    if (atLimit) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setGesture({ kind: "draw", pointerId: event.pointerId, from: point, to: point });
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const point = toPoint(event.clientX, event.clientY);
    if (!point) return;
    if (gesture.kind === "draw") setGesture({ ...gesture, to: point });
    else update(gesture.id, transformed(gesture, point), gesture.kind === "move" ? "Moved" : "Resized");
  }

  function onPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    setGesture(null);
    if (gesture.kind !== "draw" || tool === "select") return;
    let box = drawnBox(gesture.from, gesture.to);
    // A click with a drawing tool drops one grid cell where it landed.
    if (box.w < MIN_SIZE || box.h < MIN_SIZE) {
      const x = clampX(Math.floor(gesture.from.x / MAP_GRID) * MAP_GRID);
      const y = clampY(Math.floor(gesture.from.y / MAP_GRID) * MAP_GRID);
      box = { x, y, w: Math.min(MAP_GRID, width - x), h: Math.min(MAP_GRID, height - y) };
    }
    if (box.w < MIN_SIZE || box.h < MIN_SIZE) return;
    // A new shape starts as the usual thing of its kind; the panel below sets what it really is.
    const feature: MapFeature = { id: newId(), type: tool === "oval" ? "landmark" : "building", shape: tool, name: "", ...box, state: "intact" };
    onChange([...features, feature], `Drew ${SHAPE_LABELS[tool].toLowerCase()}`, `Drew|${feature.id}`);
    setSelectedId(feature.id);
    setTool("select");
  }

  const preview = gesture?.kind === "draw" && tool !== "select" ? drawnBox(gesture.from, gesture.to) : null;
  const columns = Math.floor(width / MAP_GRID);
  const rows = Math.floor(height / MAP_GRID);

  return (
    <div className="orc-shapes">

      {/* TOOLS */}
      <div className="orc-shapes-tools" role="toolbar" aria-label="Shape tools">
        {TOOLS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            className="orc-shapes-tool"
            aria-pressed={tool === entry.value}
            title={entry.value === "select" ? "Select, move and resize" : entry.value === "oval" ? "Draw an oval" : "Draw a rectangle"}
            disabled={entry.value !== "select" && atLimit}
            onClick={() => setTool(entry.value)}
          >
            {entry.value === "select" ? <MousePointer2 className="w-4 h-4" aria-hidden /> : entry.value === "rect" ? <Square className="w-4 h-4" aria-hidden /> : <Circle className="w-4 h-4" aria-hidden />}
            {entry.label}
          </button>
        ))}
        <label className="orc-shapes-snap">
          <input type="checkbox" checked={isSnapping} onChange={(event) => setIsSnapping(event.target.checked)} />
          Snap
        </label>
      </div>

      {/* CANVAS */}
      <svg
        ref={svgRef}
        className="orc-shapes-svg"
        data-tool={tool}
        viewBox={`0 0 ${width} ${height}`}
        style={{ aspectRatio: `${width} / ${height}` }}
        role="application"
        aria-label="Map shapes"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setGesture(null)}
      >
        <rect className="orc-shapes-ground" x={0} y={0} width={width} height={height} />
        {pictureUrl && <image href={pictureUrl} x={picture.x} y={picture.y} width={picture.w} height={picture.h} preserveAspectRatio="none" opacity={0.85} />}
        <g className="orc-shapes-grid" pointerEvents="none">
          {Array.from({ length: columns + 1 }, (_, c) => <line key={`v${c}`} x1={c * MAP_GRID} y1={0} x2={c * MAP_GRID} y2={height} />)}
          {Array.from({ length: rows + 1 }, (_, r) => <line key={`h${r}`} x1={0} y1={r * MAP_GRID} x2={width} y2={r * MAP_GRID} />)}
        </g>
        {["water", "road", "wall", "building", "landmark"].map((layer) =>
          features
            .filter((feature) => feature.type === layer)
            .map((feature) => (
              <g key={feature.id} className="orc-feature orc-shapes-feature" data-feature-id={feature.id} data-type={feature.type} data-state={feature.state} data-selected={feature.id === selectedId ? "true" : undefined}>
                {isOval(feature) ? (
                  <ellipse className="orc-feature-shape" cx={feature.x + feature.w / 2} cy={feature.y + feature.h / 2} rx={feature.w / 2} ry={feature.h / 2} />
                ) : (
                  <rect className="orc-feature-shape" x={feature.x} y={feature.y} width={feature.w} height={feature.h} />
                )}
                {feature.name && <text className="orc-shapes-name" x={feature.x + 4} y={feature.y + 14}>{feature.name}</text>}
              </g>
            ))
        )}
        {preview && (tool === "oval" ? (
          <ellipse className="orc-shapes-preview" cx={preview.x + preview.w / 2} cy={preview.y + preview.h / 2} rx={preview.w / 2} ry={preview.h / 2} />
        ) : (
          <rect className="orc-shapes-preview" x={preview.x} y={preview.y} width={preview.w} height={preview.h} />
        ))}
        {selected && (
          <g pointerEvents="all">
            <rect className="orc-shapes-outline" x={selected.x} y={selected.y} width={selected.w} height={selected.h} pointerEvents="none" />
            <rect className="orc-shapes-handle" data-handle="resize" x={selected.x + selected.w - 7} y={selected.y + selected.h - 7} width={14} height={14} />
          </g>
        )}
      </svg>

      {/* SELECTED SHAPE */}
      {selected ? (
        <div className="orc-shapes-inspector">
          <label className="orc-field">
            <span className="orc-field-label">Name</span>
            <input id="orc-shape-name" className="input-field" value={selected.name} maxLength={60} placeholder="Unnamed" onChange={(event) => update(selected.id, { name: event.target.value }, "Renamed")} />
          </label>
          <label className="orc-field">
            <span className="orc-field-label">Shape</span>
            <select id="orc-shape-shape" className="input-field" value={isOval(selected) ? "oval" : "rect"} onChange={(event) => update(selected.id, { shape: event.target.value as FeatureShape }, "Changed shape of")}>
              {(Object.keys(SHAPE_LABELS) as FeatureShape[]).map((shape) => <option key={shape} value={shape}>{SHAPE_LABELS[shape]}</option>)}
            </select>
          </label>
          <label className="orc-field">
            <span className="orc-field-label">Type</span>
            <select id="orc-shape-type" className="input-field" value={selected.type} onChange={(event) => update(selected.id, { type: event.target.value as FeatureType, shape: isOval(selected) ? "oval" : "rect" }, "Changed type of")}>
              {(Object.keys(TYPE_LABELS) as FeatureType[]).map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
            </select>
          </label>
          <label className="orc-field">
            <span className="orc-field-label">State</span>
            <select id="orc-shape-state" className="input-field" value={selected.state} onChange={(event) => update(selected.id, { state: event.target.value as FeatureState }, "Changed state of")}>
              {FEATURE_STATES.map((state) => <option key={state} value={state}>{STATE_LABELS[state]}</option>)}
            </select>
          </label>
          <Button className="btn-link-red orc-shapes-delete" onClick={() => remove(selected.id)} title="Delete shape (Delete)" aria-label="Delete shape">
            <Trash2 className="w-4 h-4" /> Delete
          </Button>
        </div>
      ) : (
        <p className="orc-small text-secondary orc-shapes-count">{features.length} / {MAX_FEATURES} shapes</p>
      )}
    </div>
  );
}
