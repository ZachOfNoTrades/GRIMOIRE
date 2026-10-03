"use client";

import { Crosshair, Maximize2, Minus, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Attitude, EntityKind, ExploredCircle, MapData } from "../types/oracle";
import { MAP_GRID } from "../lib/constants";
import { isVisibleFrom } from "../lib/fog";

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

// A party member standing apart from the party token: its own token and its own circle of sight.
export interface MapMember {
  id: string;
  name: string;
  x: number;
  y: number;
}

interface MapCanvasProps {
  data: MapData;
  partyX: number;
  partyY: number;
  visionRadius: number;
  explored: ExploredCircle[];
  tokens: MapToken[];
  members?: MapMember[];
  backgroundUrl?: string | null; // a picture drawn under the grid, stretched to the map
  // "dm": everything is visible, the fog is a tint, the map can be worked on.
  // "player": unexplored is solid, explored is dimmed, and the view follows the party.
  mode: "dm" | "player";
  tool?: MapTool;
  brushRadius?: number; // reveal/hide brush, drawn under the pointer so its reach is visible
  selectedId?: string | null;
  shownId?: string | null; // the entry whose details are on the player display right now
  onPartyDrop?: (x: number, y: number, fromX: number, fromY: number) => void;
  onBrush?: (x: number, y: number) => void;
  onBrushEnd?: () => void;
  onPlace?: (x: number, y: number) => void;
  onTokenSelect?: (id: string) => void;
  onTokenDrop?: (id: string, x: number, y: number) => void;
  onMemberDrop?: (id: string, x: number, y: number, fromX: number, fromY: number) => void;
  onPartySelect?: () => void; // a tap on the party token (no drag)
  // Zoom in on a point: the view closes to a fifth of the map's width around it. A new `nonce`
  // repeats the request for the same point.
  focus?: { x: number; y: number; nonce: number } | null;
}

const FOCUS_ZOOM = 5;

type Drag = { kind: "party" | "token" | "member"; id: string | null; x: number; y: number; moved: boolean } | null;

// How far past the map's edge the view may be dragged, as a share of the view: the edge can be
// brought three quarters of the way across the screen.
const PAN_BLEED = 0.75;

// LABELS — every label on the map, placed so none sit on top of each other. Party and members
// go first, then creatures, pins, and finally the map's own feature names, which are dropped when
// nothing fits. Sizes are estimated from the character count.
interface LabelRequest {
  key: string;
  x: number; // left edge (or center when `centered`)
  y: number; // baseline
  text: string;
  size: number;
  centered?: boolean;
  priority: number;
  canHide: boolean;
}
function placeLabels(requests: LabelRequest[]): Map<string, { dy: number; hidden: boolean }> {
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const result = new Map<string, { dy: number; hidden: boolean }>();
  const box = (request: LabelRequest, dy: number) => {
    const width = request.text.length * request.size * 0.62;
    const x0 = request.centered ? request.x - width / 2 : request.x;
    return { x0, y0: request.y + dy - request.size, x1: x0 + width, y1: request.y + dy + request.size * 0.25 };
  };
  const overlaps = (a: { x0: number; y0: number; x1: number; y1: number }) => placed.some((b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0);
  for (const request of [...requests].sort((a, b) => a.priority - b.priority)) {
    const step = request.size * 1.25;
    let chosen: number | null = null;
    for (const dy of [0, step, -step, step * 2]) {
      if (!overlaps(box(request, dy))) {
        chosen = dy;
        break;
      }
    }
    if (chosen === null && request.canHide) {
      result.set(request.key, { dy: 0, hidden: true });
      continue;
    }
    const dy = chosen ?? 0;
    placed.push(box(request, dy));
    result.set(request.key, { dy, hidden: false });
  }
  return result;
}

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
  members = [],
  backgroundUrl = null,
  mode,
  tool = "move",
  brushRadius = 0,
  selectedId = null,
  shownId = null,
  onPartyDrop,
  onBrush,
  onBrushEnd,
  onPlace,
  onTokenSelect,
  onTokenDrop,
  onMemberDrop,
  onPartySelect,
  focus = null,
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
  // Player display: false while the view follows the party, true once someone pans or zooms it.
  const [isFree, setIsFree] = useState(false);
  const followRef = useRef<View>({ zoom: 1, cx: data.width / 2, cy: data.height / 2 }); // the following view, as a View
  const panRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const pinchRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const isDm = mode === "dm";
  const party = drag?.kind === "party" ? { x: drag.x, y: drag.y } : { x: partyX, y: partyY };
  const memberPositions = members.map((member) => (drag?.kind === "member" && drag.id === member.id ? { ...member, x: drag.x, y: drag.y } : member));
  // Everything the players see from: the party token and each member standing apart.
  const sightPoints = [party, ...memberPositions.map((member) => ({ x: member.x, y: member.y }))];

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

  // On the player display the first pan or zoom takes over from following the party, starting
  // from where the following view was.
  function takeOver() {
    if (isDm || isFree) return;
    setView(followRef.current);
    setIsFree(true);
  }

  // Wheel zoom is registered by hand: React's onWheel is passive, so it cannot stop the page scroll.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const matrix = svg.getScreenCTM();
      const point = matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.03 : 0.0015));
      if (!isDm && !isFree) {
        setIsFree(true);
        setView(followRef.current);
      }
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
  }, [isDm, isFree, data.width, data.height]);

  // A different map starts fitted (and, on the display, following the party again).
  useEffect(() => {
    setView({ zoom: 1, cx: data.width / 2, cy: data.height / 2 });
    setIsFree(false);
  }, [data.width, data.height]);

  // ZOOM TO — a request from the details panel
  useEffect(() => {
    if (!focus || !isDm) return;
    setView({ zoom: FOCUS_ZOOM, cx: focus.x, cy: focus.y });
  }, [focus, isDm]);

  // VIEW BOX — the DM sees the whole map, or a zoomed window of it. The player display zooms in on
  // the party: tall enough to show the vision circle with room around it, shaped like the screen,
  // kept inside the map where the map is big enough.
  let viewBox = `0 0 ${data.width} ${data.height}`;
  const isWindowed = isDm ? view.zoom > 1 : isFree;
  if (isWindowed && view.zoom > 1) {
    const viewWidth = data.width / view.zoom;
    const viewHeight = data.height / view.zoom;
    const x = Math.min(Math.max(view.cx - viewWidth / 2, -viewWidth * PAN_BLEED), data.width - viewWidth * (1 - PAN_BLEED));
    const y = Math.min(Math.max(view.cy - viewHeight / 2, -viewHeight * PAN_BLEED), data.height - viewHeight * (1 - PAN_BLEED));
    viewBox = `${x} ${y} ${viewWidth} ${viewHeight}`;
  }
  if (!isDm) {
    const viewHeight = Math.min(Math.max(visionRadius * 4.2, 320), Math.max(data.height, 320));
    const viewWidth = viewHeight * aspect;
    const clampAxis = (center: number, size: number, limit: number) =>
      size >= limit ? (limit - size) / 2 : Math.min(Math.max(center - size / 2, 0), limit - size);
    const followX = clampAxis(party.x, viewWidth, data.width);
    const followY = clampAxis(party.y, viewHeight, data.height);
    followRef.current = { zoom: Math.max(1, data.height / viewHeight), cx: followX + viewWidth / 2, cy: followY + viewHeight / 2 };
    if (!isFree) viewBox = `${followX} ${followY} ${viewWidth} ${viewHeight}`;
  }

  function toMapPoint(event: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: Math.min(Math.max(point.x, 0), data.width), y: Math.min(Math.max(point.y, 0), data.height) };
  }

  function startDrag(event: React.PointerEvent, kind: "party" | "token" | "member", id: string | null, x: number, y: number) {
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
      else onPartySelect?.();
    } else if (finished.kind === "member" && finished.id) {
      const before = members.find((member) => member.id === finished.id);
      if (finished.moved && before) onMemberDrop?.(finished.id, finished.x, finished.y, before.x, before.y);
    } else if (finished.id) {
      if (finished.moved) onTokenDrop?.(finished.id, finished.x, finished.y);
      else onTokenSelect?.(finished.id);
    }
  }

  // BACKGROUND GESTURES — the reveal/hide brush paints while the pointer is down; the place tool
  // drops a new entry where the map is tapped.
  function backgroundDown(event: React.PointerEvent) {
    const point = toMapPoint(event);
    if (!point) return;
    // Two fingers pinch, whatever the tool.
    if (event.pointerType === "touch") {
      pinchRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchRef.current.size === 2) {
        brushingRef.current = false;
        panRef.current = null;
        takeOver();
        pinchStartRef.current = { distance: pinchDistance(), zoom: isDm || isFree ? view.zoom : followRef.current.zoom };
        return;
      }
    }
    // The player display: any drag looks around.
    if (!isDm) {
      takeOver();
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
      panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      return;
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

  // LABEL PLACEMENT — one pass over everything that carries text
  const labelRequests: LabelRequest[] = [
    { key: "party", x: party.x, y: party.y + labelSize * 2.4, text: "PARTY", size: labelSize, centered: true, priority: 0, canHide: false },
    ...memberPositions.map((member) => ({ key: `m:${member.id}`, x: member.x, y: member.y + labelSize * 2, text: member.name, size: labelSize * 0.85, centered: true, priority: 0, canHide: false })),
    ...tokens
      .filter((token) => token.kind !== "place")
      .map((token) => {
        const position = drag?.kind === "token" && drag.id === token.id ? { x: drag.x, y: drag.y } : { x: token.x, y: token.y };
        return { key: `t:${token.id}`, x: position.x + labelSize * 1.2, y: position.y + labelSize * 0.35, text: token.name, size: labelSize, priority: 1, canHide: false };
      }),
    ...data.features
      .filter((feature) => feature.name && (feature.type === "building" || feature.type === "landmark"))
      .map((feature) => ({
        key: `f:${feature.id}`,
        x: feature.x + 5,
        y: feature.type === "landmark" ? feature.y - 5 : feature.y + labelSize + 3,
        text: feature.name.toUpperCase(),
        size: labelSize,
        priority: 3,
        canHide: true,
      })),
  ];
  const labels = placeLabels(labelRequests);
  const labelAt = (key: string) => labels.get(key) ?? { dy: 0, hidden: false };

  return (
    // MAP WRAPPER
    <div ref={wrapRef} className="orc-map" data-mode={mode} data-tool={isDm ? tool : undefined} data-zoomed={isWindowed ? "true" : undefined} data-picture={backgroundUrl ? "true" : undefined}>

      {/* ZOOM CONTROLS — Shift+click steps by 2% instead of 10%; the wheel and a pinch are continuous.
          On the display, a zoom lets go of following the party; "Follow party" picks it up again. */}
      {(isDm || isFree) && (
        <div className="orc-zoom" role="group" aria-label="Map zoom">
          {!isDm && (
            <button type="button" className="orc-zoom-btn orc-zoom-follow" title="Follow the party again" aria-label="Follow party" onClick={() => setIsFree(false)}>
              <Crosshair className="w-4 h-4" /> Follow party
            </button>
          )}
          <button type="button" className="orc-zoom-btn" disabled={view.zoom <= ZOOM_MIN} title="Zoom out (Shift for a fine step)" aria-label="Zoom out" onClick={(event) => { takeOver(); zoomTo(view.zoom / (event.shiftKey ? ZOOM_FINE_STEP : ZOOM_STEP)); }}>
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
        preserveAspectRatio={isDm || isFree ? "xMidYMid meet" : "xMidYMid slice"}
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
              {sightPoints.map((point, index) => (
                <circle key={`s${index}`} cx={point.x} cy={point.y} r={visionRadius} fill="black" />
              ))}
            </g>
          </mask>

          {/* OUT-OF-SIGHT MASK — white everywhere except what the party sees right now */}
          <mask id={`${maskId}-dim`} maskUnits="userSpaceOnUse" {...cover}>
            <rect {...cover} fill="white" />
            <g filter={`url(#${maskId}-soft)`}>
              {sightPoints.map((point, index) => (
                <circle key={`d${index}`} cx={point.x} cy={point.y} r={visionRadius} fill="black" />
              ))}
            </g>
          </mask>
        </defs>

        {/* GROUND */}
        <rect className="orc-map-ground" {...cover} />

        {/* BACKGROUND PICTURE — stretched to the map; features are drawn lightly over it */}
        {backgroundUrl && <image className="orc-map-picture" href={backgroundUrl} x={0} y={0} width={data.width} height={data.height} preserveAspectRatio="none" />}

        {/* GRID */}
        <g className="orc-map-grid">
          {Array.from({ length: Math.floor(data.width / MAP_GRID) + 1 }, (_, index) => (
            <line key={`v${index}`} x1={index * MAP_GRID} y1={0} x2={index * MAP_GRID} y2={data.height} />
          ))}
          {Array.from({ length: Math.floor(data.height / MAP_GRID) + 1 }, (_, index) => (
            <line key={`h${index}`} x1={0} y1={index * MAP_GRID} x2={data.width} y2={index * MAP_GRID} />
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
                {feature.name && (feature.type === "building" || feature.type === "landmark") && !labelAt(`f:${feature.id}`).hidden && (
                  <text x={feature.x + 5} y={(feature.type === "landmark" ? feature.y - 5 : feature.y + labelSize + 3) + labelAt(`f:${feature.id}`).dy} fontSize={labelSize}>
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
            const hidden = isDm && !isVisibleFrom(sightPoints, visionRadius, position.x, position.y);
            return (
              <g
                key={token.id}
                className="orc-token"
                data-attitude={token.attitude}
                data-selected={selectedId === token.id ? "true" : undefined}
                data-shown={shownId === token.id ? "true" : undefined}
                data-hidden={hidden ? "true" : undefined}
                onPointerDown={(event) => startDrag(event, "token", token.id, position.x, position.y)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={() => setDrag(null)}
              >
                <circle cx={position.x} cy={position.y} r={labelSize * 0.8} />
                <text x={position.x + labelSize * 1.2} y={position.y + labelSize * 0.35 + labelAt(`t:${token.id}`).dy} fontSize={labelSize}>
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
            {sightPoints.map((point, index) => (
              <circle key={index} className="orc-fog-outline-visible" cx={point.x} cy={point.y} r={visionRadius} />
            ))}
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
                  data-shown={shownId === token.id ? "true" : undefined}
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

        {/* MEMBERS STANDING APART — smaller party-colored tokens, draggable like the party */}
        {memberPositions.map((member) => (
          <g
            key={member.id}
            className="orc-party orc-member"
            onPointerDown={(event) => startDrag(event, "member", member.id, member.x, member.y)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={() => setDrag(null)}
          >
            <circle cx={member.x} cy={member.y} r={labelSize * 0.8} />
            <text x={member.x} y={member.y + labelSize * 2 + labelAt(`m:${member.id}`).dy} fontSize={labelSize * 0.85} textAnchor="middle">
              {member.name}
            </text>
          </g>
        ))}

        {/* PARTY TOKEN */}
        <g
          className="orc-party"
          onPointerDown={(event) => startDrag(event, "party", null, party.x, party.y)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={() => setDrag(null)}
        >
          <circle cx={party.x} cy={party.y} r={labelSize * 1.1} />
          <text x={party.x} y={party.y + labelSize * 2.4 + labelAt("party").dy} fontSize={labelSize} textAnchor="middle">
            PARTY
          </text>
        </g>
      </svg>
    </div>
  );
}
