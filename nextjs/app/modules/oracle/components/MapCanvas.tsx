"use client";

import { Maximize2, Minus, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Attitude, EntityKind, ExploredCircle, MapData } from "../types/oracle";
import { isVisible } from "../lib/fog";

// One thing drawn on top of the map. The DM's view gets every placed entry; the player display
// gets only what the server decided the players may see.
export interface MapToken {
  id: string;
  name: string;
  kind: EntityKind;
  attitude: Attitude;
  x: number;
  y: number;
  pin?: number; // places are drawn as numbered pins on the DM's map
}

export type MapTool = "move" | "reveal" | "hide" | "place";

interface MapCanvasProps {
  data: MapData;
  partyX: number;
  partyY: number;
  visionRadius: number;
  explored: ExploredCircle[];
  tokens: MapToken[];
  // "dm": everything is visible, the fog is a tint, the map can be worked on.
  // "player": unexplored is solid, explored is dimmed, and the view follows the party.
  mode: "dm" | "player";
  tool?: MapTool;
  brushRadius?: number; // reveal/hide brush, drawn under the pointer so its reach is visible
  selectedId?: string | null;
  onPartyDrop?: (x: number, y: number, fromX: number, fromY: number) => void;
  onBrush?: (x: number, y: number) => void;
  onBrushEnd?: () => void;
  onPlace?: (x: number, y: number) => void;
  onTokenSelect?: (id: string) => void;
  onTokenDrop?: (id: string, x: number, y: number) => void;
}

type Drag = { kind: "party" | "token"; id: string | null; x: number; y: number; moved: boolean } | null;

// DM VIEW — zoom 1 fits the whole map; higher values look closer at (cx, cy) in map units.
type View = { zoom: number; cx: number; cy: number };
const ZOOM_MIN = 1;
const ZOOM_MAX = 8;
const ZOOM_STEP = 1.1; // one button press
const ZOOM_FINE_STEP = 1.02; // with Shift held
const clampZoom = (zoom: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));

// The map is drawn as SVG from structured features. Coordinates are map units; the viewBox does
// the scaling, so the same drawing fills a phone, a laptop pane or the shared screen.
export default function MapCanvas({
  data,
  partyX,
  partyY,
  visionRadius,
  explored,
  tokens,
  mode,
  tool = "move",
  brushRadius = 0,
  selectedId = null,
  onPartyDrop,
  onBrush,
  onBrushEnd,
  onPlace,
  onTokenSelect,
  onTokenDrop,
}: MapCanvasProps) {
  const maskId = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const brushingRef = useRef(false);

  // STATE
  const [drag, setDrag] = useState<Drag>(null);
  const [aspect, setAspect] = useState(data.width / data.height); // the box the map is drawn into
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, cx: data.width / 2, cy: data.height / 2 });
  const panRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const pinchRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const isDm = mode === "dm";
  const party = drag?.kind === "party" ? { x: drag.x, y: drag.y } : { x: partyX, y: partyY };

  // Track the container's shape so the player view can fill it exactly.
  useEffect(() => {
    const element = wrapRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth > 0 && element.clientHeight > 0) setAspect(element.clientWidth / element.clientHeight);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // ZOOM — about a map point (the cursor, or the center), kept inside the map.
  function zoomTo(zoom: number, about?: { x: number; y: number }) {
    setView((current) => {
      const next = clampZoom(zoom);
      if (next === current.zoom) return current;
      if (next === ZOOM_MIN) return { zoom: 1, cx: data.width / 2, cy: data.height / 2 };
      const anchor = about ?? { x: current.cx, y: current.cy };
      // Keep the anchor under the same screen spot: the center moves toward it as we zoom in.
      const ratio = current.zoom / next;
      return { zoom: next, cx: anchor.x + (current.cx - anchor.x) * ratio, cy: anchor.y + (current.cy - anchor.y) * ratio };
    });
  }

  function panBy(dx: number, dy: number) {
    setView((current) => ({ ...current, cx: current.cx + dx, cy: current.cy + dy }));
  }

  // Wheel zoom is registered by hand: React's onWheel is passive, so it cannot stop the page scroll.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !isDm) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const matrix = svg.getScreenCTM();
      const point = matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.03 : 0.0015));
      setView((current) => {
        const next = clampZoom(current.zoom * factor);
        if (next === current.zoom) return current;
        if (next === ZOOM_MIN) return { zoom: 1, cx: data.width / 2, cy: data.height / 2 };
        const anchor = point ?? { x: current.cx, y: current.cy };
        const ratio = current.zoom / next;
        return { zoom: next, cx: anchor.x + (current.cx - anchor.x) * ratio, cy: anchor.y + (current.cy - anchor.y) * ratio };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [isDm, data.width, data.height]);

  // A different map starts fitted.
  useEffect(() => {
    setView({ zoom: 1, cx: data.width / 2, cy: data.height / 2 });
  }, [data.width, data.height]);

  // VIEW BOX — the DM sees the whole map, or a zoomed window of it. The player display zooms in on
  // the party: tall enough to show the vision circle with room around it, shaped like the screen,
  // kept inside the map where the map is big enough.
  let viewBox = `0 0 ${data.width} ${data.height}`;
  if (isDm && view.zoom > 1) {
    const viewWidth = data.width / view.zoom;
    const viewHeight = data.height / view.zoom;
    const x = Math.min(Math.max(view.cx - viewWidth / 2, 0), data.width - viewWidth);
    const y = Math.min(Math.max(view.cy - viewHeight / 2, 0), data.height - viewHeight);
    viewBox = `${x} ${y} ${viewWidth} ${viewHeight}`;
  }
  if (!isDm) {
    const viewHeight = Math.min(Math.max(visionRadius * 4.2, 320), Math.max(data.height, 320));
    const viewWidth = viewHeight * aspect;
    const clampAxis = (center: number, size: number, limit: number) =>
      size >= limit ? (limit - size) / 2 : Math.min(Math.max(center - size / 2, 0), limit - size);
    viewBox = `${clampAxis(party.x, viewWidth, data.width)} ${clampAxis(party.y, viewHeight, data.height)} ${viewWidth} ${viewHeight}`;
  }

  function toMapPoint(event: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: Math.min(Math.max(point.x, 0), data.width), y: Math.min(Math.max(point.y, 0), data.height) };
  }

  function startDrag(event: React.PointerEvent, kind: "party" | "token", id: string | null, x: number, y: number) {
    if (!isDm || tool !== "move") return;
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    setDrag({ kind, id, x, y, moved: false });
  }

  function moveDrag(event: React.PointerEvent) {
    if (!drag) return;
    const point = toMapPoint(event);
    if (point) setDrag({ ...drag, x: point.x, y: point.y, moved: true });
  }

  function endDrag() {
    if (!drag) return;
    const finished = drag;
    setDrag(null);
    if (finished.kind === "party") {
      if (finished.moved) onPartyDrop?.(finished.x, finished.y, partyX, partyY);
    } else if (finished.id) {
      if (finished.moved) onTokenDrop?.(finished.id, finished.x, finished.y);
      else onTokenSelect?.(finished.id);
    }
  }

  // BACKGROUND GESTURES — the reveal/hide brush paints while the pointer is down; the place tool
  // drops a new entry where the map is tapped.
  function backgroundDown(event: React.PointerEvent) {
    if (!isDm) return;
    const point = toMapPoint(event);
    if (!point) return;
    // Two fingers pinch, whatever the tool.
    if (event.pointerType === "touch") {
      pinchRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchRef.current.size === 2) {
        brushingRef.current = false;
        panRef.current = null;
        pinchStartRef.current = { distance: pinchDistance(), zoom: view.zoom };
        return;
      }
    }
    // Middle button, or the move tool on empty ground, drags the view when zoomed in.
    if (event.button === 1 || (tool === "move" && view.zoom > 1)) {
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
      panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      return;
    }
    if (tool === "reveal" || tool === "hide") {
      brushingRef.current = true;
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
      onBrush?.(point.x, point.y);
    } else if (tool === "place") {
      onPlace?.(point.x, point.y);
    }
  }

  function pinchDistance(): number {
    const [a, b] = Array.from(pinchRef.current.values());
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  // Screen pixels to map units at the current zoom, for panning.
  function mapUnitsPerPixel(): number {
    const svg = svgRef.current;
    if (!svg) return 1;
    const box = svg.getBoundingClientRect();
    const shown = data.width / view.zoom;
    const scale = Math.min(box.width / shown, box.height / (data.height / view.zoom));
    return scale > 0 ? 1 / scale : 1;
  }

  const isBrushTool = isDm && (tool === "reveal" || tool === "hide");

  function backgroundMove(event: React.PointerEvent) {
    if (isBrushTool && event.pointerType !== "touch") setHover(toMapPoint(event));
    if (pinchRef.current.has(event.pointerId)) {
      pinchRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchRef.current.size === 2 && pinchStartRef.current && pinchStartRef.current.distance > 0) {
        zoomTo(pinchStartRef.current.zoom * (pinchDistance() / pinchStartRef.current.distance));
        return;
      }
    }
    const pan = panRef.current;
    if (pan && pan.pointerId === event.pointerId) {
      const unit = mapUnitsPerPixel();
      panBy((pan.x - event.clientX) * unit, (pan.y - event.clientY) * unit);
      panRef.current = { ...pan, x: event.clientX, y: event.clientY, moved: true };
      return;
    }
    if (!brushingRef.current) return;
    const point = toMapPoint(event);
    if (point) onBrush?.(point.x, point.y);
  }

  function backgroundUp(event: React.PointerEvent) {
    if (pinchRef.current.delete(event.pointerId) && pinchRef.current.size < 2) pinchStartRef.current = null;
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
      return;
    }
    if (!brushingRef.current) return;
    brushingRef.current = false;
    onBrushEnd?.();
  }

  const labelSize = Math.max(11, data.width / 80);
  const cover = { x: -data.width, y: -data.height, width: data.width * 3, height: data.height * 3 };

  return (
    // MAP WRAPPER
    <div ref={wrapRef} className="orc-map" data-mode={mode} data-tool={isDm ? tool : undefined} data-zoomed={isDm && view.zoom > 1 ? "true" : undefined}>

      {/* ZOOM CONTROLS — DM only. Shift+click steps by 2% instead of 10%; the wheel and a pinch are continuous. */}
      {isDm && (
        <div className="orc-zoom" role="group" aria-label="Map zoom">
          <button type="button" className="orc-zoom-btn" disabled={view.zoom <= ZOOM_MIN} title="Zoom out (Shift for a fine step)" aria-label="Zoom out" onClick={(event) => zoomTo(view.zoom / (event.shiftKey ? ZOOM_FINE_STEP : ZOOM_STEP))}>
            <Minus className="w-4 h-4" />
          </button>
          <span className="orc-zoom-value" aria-live="polite">{Math.round(view.zoom * 100)}%</span>
          <button type="button" className="orc-zoom-btn" disabled={view.zoom >= ZOOM_MAX} title="Zoom in (Shift for a fine step)" aria-label="Zoom in" onClick={(event) => zoomTo(view.zoom * (event.shiftKey ? ZOOM_FINE_STEP : ZOOM_STEP))}>
            <Plus className="w-4 h-4" />
          </button>
          <button type="button" className="orc-zoom-btn" disabled={view.zoom <= ZOOM_MIN} title="Fit the whole map" aria-label="Fit the whole map" onClick={() => zoomTo(ZOOM_MIN)}>
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* MAP DRAWING */}
      <svg
        ref={svgRef}
        className="orc-map-svg"
        viewBox={viewBox}
        preserveAspectRatio={isDm ? "xMidYMid meet" : "xMidYMid slice"}
        role="img"
        aria-label="Map"
        onPointerDown={backgroundDown}
        onPointerMove={backgroundMove}
        onPointerUp={backgroundUp}
        onPointerCancel={backgroundUp}
        onPointerLeave={() => setHover(null)}
      >
        <defs>

          {/* SOFT EDGE — feathers the fog boundary on the player display */}
          <filter id={`${maskId}-soft`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={isDm ? 0 : 9} />
          </filter>

          {/* UNEXPLORED MASK — white where nothing has been seen */}
          <mask id={`${maskId}-unexplored`} maskUnits="userSpaceOnUse" {...cover}>
            <rect {...cover} fill="white" />
            <g filter={`url(#${maskId}-soft)`}>
              {explored.map((circle, index) => (
                <circle key={index} cx={circle.x} cy={circle.y} r={circle.r} fill="black" />
              ))}
              <circle cx={party.x} cy={party.y} r={visionRadius} fill="black" />
            </g>
          </mask>

          {/* OUT-OF-SIGHT MASK — white everywhere except the party's current vision */}
          <mask id={`${maskId}-dim`} maskUnits="userSpaceOnUse" {...cover}>
            <rect {...cover} fill="white" />
            <g filter={`url(#${maskId}-soft)`}>
              <circle cx={party.x} cy={party.y} r={visionRadius} fill="black" />
            </g>
          </mask>
        </defs>

        {/* GROUND */}
        <rect className="orc-map-ground" {...cover} />

        {/* GRID */}
        <g className="orc-map-grid">
          {Array.from({ length: Math.floor(data.width / 50) + 1 }, (_, index) => (
            <line key={`v${index}`} x1={index * 50} y1={0} x2={index * 50} y2={data.height} />
          ))}
          {Array.from({ length: Math.floor(data.height / 50) + 1 }, (_, index) => (
            <line key={`h${index}`} x1={0} y1={index * 50} x2={data.width} y2={index * 50} />
          ))}
        </g>

        {/* FEATURES — water and roads under walls, buildings and landmarks */}
        {["water", "road", "wall", "building", "landmark"].map((layer) =>
          data.features
            .filter((feature) => feature.type === layer)
            .map((feature) => (
              <g key={feature.id} className="orc-feature" data-type={feature.type} data-state={feature.state}>
                {feature.type === "landmark" ? (
                  <ellipse cx={feature.x + feature.w / 2} cy={feature.y + feature.h / 2} rx={feature.w / 2} ry={feature.h / 2} />
                ) : (
                  <rect x={feature.x} y={feature.y} width={feature.w} height={feature.h} />
                )}
                {feature.state !== "intact" && feature.type === "building" && (
                  <rect className="orc-feature-rubble" x={feature.x + feature.w * 0.25} y={feature.y + feature.h * 0.35} width={feature.w * 0.5} height={feature.h * 0.4} />
                )}
                {feature.name && (feature.type === "building" || feature.type === "landmark") && (
                  <text x={feature.x + 5} y={feature.type === "landmark" ? feature.y - 5 : feature.y + labelSize + 3} fontSize={labelSize}>
                    {feature.name.toUpperCase()}
                  </text>
                )}
              </g>
            ))
        )}

        {/* CREATURES AND PEOPLE — under the fog, so the tint itself shows the DM what is hidden */}
        {tokens
          .filter((token) => token.kind !== "place")
          .map((token) => {
            const position = drag?.kind === "token" && drag.id === token.id ? { x: drag.x, y: drag.y } : { x: token.x, y: token.y };
            const hidden = isDm && !isVisible(party.x, party.y, visionRadius, position.x, position.y);
            return (
              <g
                key={token.id}
                className="orc-token"
                data-attitude={token.attitude}
                data-selected={selectedId === token.id ? "true" : undefined}
                data-hidden={hidden ? "true" : undefined}
                onPointerDown={(event) => startDrag(event, "token", token.id, position.x, position.y)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={() => setDrag(null)}
              >
                <circle cx={position.x} cy={position.y} r={labelSize * 0.8} />
                <text x={position.x + labelSize * 1.2} y={position.y + labelSize * 0.35} fontSize={labelSize}>
                  {token.name}
                  {hidden ? " · hidden" : ""}
                </text>
              </g>
            );
          })}

        {/* FOG — out of sight (dim), then never seen (solid on the player display) */}
        <rect className="orc-fog-dim" {...cover} mask={`url(#${maskId}-dim)`} />
        <rect className="orc-fog-unexplored" {...cover} mask={`url(#${maskId}-unexplored)`} />

        {/* DM OUTLINES — where the players' view ends */}
        {isDm && (
          <g className="orc-fog-outline">
            {explored.map((circle, index) => (
              <circle key={index} className="orc-fog-outline-explored" cx={circle.x} cy={circle.y} r={circle.r} />
            ))}
            <circle className="orc-fog-outline-visible" cx={party.x} cy={party.y} r={visionRadius} />
          </g>
        )}

        {/* PLACE PINS — DM only, above the fog so they stay readable */}
        {isDm &&
          tokens
            .filter((token) => token.kind === "place")
            .map((token) => {
              const position = drag?.kind === "token" && drag.id === token.id ? { x: drag.x, y: drag.y } : { x: token.x, y: token.y };
              const size = labelSize * 1.7;
              return (
                <g
                  key={token.id}
                  className="orc-pin"
                  data-selected={selectedId === token.id ? "true" : undefined}
                  onPointerDown={(event) => startDrag(event, "token", token.id, position.x, position.y)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={() => setDrag(null)}
                >
                  <title>{token.name}</title>
                  <rect x={position.x - size / 2} y={position.y - size / 2} width={size} height={size} />
                  <text x={position.x} y={position.y + labelSize * 0.38} fontSize={labelSize} textAnchor="middle">
                    {token.pin}
                  </text>
                </g>
              );
            })}

        {/* BRUSH PREVIEW — where the next stroke lands */}
        {isBrushTool && hover && brushRadius > 0 && <circle className="orc-brush-ring" data-tool={tool} cx={hover.x} cy={hover.y} r={brushRadius} />}

        {/* PARTY TOKEN */}
        <g
          className="orc-party"
          onPointerDown={(event) => startDrag(event, "party", null, party.x, party.y)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={() => setDrag(null)}
        >
          <circle cx={party.x} cy={party.y} r={labelSize * 1.1} />
          <text x={party.x} y={party.y + labelSize * 2.4} fontSize={labelSize} textAnchor="middle">
            PARTY
          </text>
        </g>
      </svg>
    </div>
  );
}
