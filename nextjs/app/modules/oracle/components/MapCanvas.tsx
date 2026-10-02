"use client";

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
  selectedId?: string | null;
  onPartyDrop?: (x: number, y: number, fromX: number, fromY: number) => void;
  onBrush?: (x: number, y: number) => void;
  onBrushEnd?: () => void;
  onPlace?: (x: number, y: number) => void;
  onTokenSelect?: (id: string) => void;
  onTokenDrop?: (id: string, x: number, y: number) => void;
}

type Drag = { kind: "party" | "token"; id: string | null; x: number; y: number; moved: boolean } | null;

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

  // VIEW BOX — the DM sees the whole map. The player display zooms in on the party: tall enough
  // to show the vision circle with room around it, shaped like the screen, kept inside the map
  // where the map is big enough.
  let viewBox = `0 0 ${data.width} ${data.height}`;
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
    if (tool === "reveal" || tool === "hide") {
      brushingRef.current = true;
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
      onBrush?.(point.x, point.y);
    } else if (tool === "place") {
      onPlace?.(point.x, point.y);
    }
  }

  function backgroundMove(event: React.PointerEvent) {
    if (!brushingRef.current) return;
    const point = toMapPoint(event);
    if (point) onBrush?.(point.x, point.y);
  }

  function backgroundUp() {
    if (!brushingRef.current) return;
    brushingRef.current = false;
    onBrushEnd?.();
  }

  const labelSize = Math.max(11, data.width / 80);
  const cover = { x: -data.width, y: -data.height, width: data.width * 3, height: data.height * 3 };

  return (
    // MAP WRAPPER
    <div ref={wrapRef} className="orc-map" data-mode={mode} data-tool={isDm ? tool : undefined}>

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
