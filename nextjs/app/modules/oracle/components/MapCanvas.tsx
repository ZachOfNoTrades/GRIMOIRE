"use client";

import { Contrast, Crosshair, Maximize2, Minus, Plus, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Attitude, EntityKind, ExploredCircle, MapData } from "../types/oracle";
import { MAP_GRID } from "../lib/constants";
import { isVisibleFrom } from "../lib/fog";
import RangeValue from "./RangeValue";

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
  revealed?: boolean; // shown to the players by hand, whatever the party can see
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
  backgroundUrl?: string | null; // a picture drawn under the grid
  pictureOpacity?: number; // 0 to 1, how strongly the picture shows
  onPictureOpacity?: (opacity: number) => void; // present on the player display: its bar gets the slider
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
  onCancelTool?: () => void; // a right-click while placing or painting fog
  onGroundContext?: (x: number, y: number, clientX: number, clientY: number) => void; // a right-click on bare ground
  onTokenSelect?: (id: string) => void;
  onTokenDrop?: (id: string, x: number, y: number) => void;
  onTokenContext?: (id: string, clientX: number, clientY: number) => void;
  onMemberDrop?: (id: string, x: number, y: number, fromX: number, fromY: number) => void;
  onPartySelect?: () => void; // a tap on the party token (no drag)
  linkedFeatures?: string[]; // buildings and landmarks that open a location when tapped
  onFeatureSelect?: (featureId: string) => void; // a tap on a linked building or landmark on the player display
  onGroundClick?: (x: number, y: number) => void; // a tap on bare ground with the move tool
  // Zoom in on a point. A new `nonce` repeats the request for the same point.
  focus?: { x: number; y: number; nonce: number } | null;
  // Player display: an entry the DM just revealed. The camera pulls back to show the party and it,
  // the entry's icon and nameplate are revealed, and the camera returns. A new `nonce` plays it again.
  revealFocus?: { id: string; x: number; y: number; nonce: number } | null;
  barExtras?: React.ReactNode; // the DM's sliders, shown first in the action bar
}

const FOCUS_ZOOM = 2.5;

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

// OUTLINES — the edge of a union of circles. Each circle contributes only the arcs that no other
// circle covers, so no line is drawn inside another circle. `inside` are circles that hide arcs
// without being drawn themselves.
interface Circle {
  x: number;
  y: number;
  r: number;
}
const TAU = Math.PI * 2;
function outlinePath(circles: Circle[], inside: Circle[] = []): string {
  const parts: string[] = [];
  circles.forEach((circle, index) => {
    const covered: [number, number][] = [];
    let isHidden = false;
    const consider = (other: Circle, otherIndex: number, isDrawn: boolean) => {
      const distance = Math.hypot(other.x - circle.x, other.y - circle.y);
      if (distance + circle.r <= other.r + 0.01) {
        // Inside the other circle. Two equal circles: only the later one is dropped.
        if (!(isDrawn && distance < 0.01 && Math.abs(other.r - circle.r) < 0.01 && otherIndex > index)) isHidden = true;
        return;
      }
      if (distance >= circle.r + other.r || distance + other.r <= circle.r) return;
      const angle = Math.atan2(other.y - circle.y, other.x - circle.x);
      const half = Math.acos(Math.min(1, Math.max(-1, (circle.r * circle.r + distance * distance - other.r * other.r) / (2 * circle.r * distance))));
      let start = angle - half;
      let end = angle + half;
      if (start < 0) {
        start += TAU;
        end += TAU;
      }
      if (end > TAU) {
        covered.push([start, TAU], [0, end - TAU]);
      } else {
        covered.push([start, end]);
      }
    };
    circles.forEach((other, otherIndex) => {
      if (otherIndex !== index && !isHidden) consider(other, otherIndex, true);
    });
    inside.forEach((other, otherIndex) => {
      if (!isHidden) consider(other, otherIndex, false);
    });
    if (isHidden) return;
    covered.sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    const arcs: [number, number][] = [];
    for (const [start, end] of covered) {
      if (start > cursor) arcs.push([cursor, start]);
      cursor = Math.max(cursor, end);
    }
    if (cursor < TAU) arcs.push([cursor, TAU]);
    for (const [start, end] of arcs) {
      if (end - start < 0.002) continue;
      if (end - start > TAU - 0.002) {
        // A whole circle, as two half arcs (one arc cannot start and end at the same point).
        parts.push(`M ${circle.x + circle.r} ${circle.y} A ${circle.r} ${circle.r} 0 1 1 ${circle.x - circle.r} ${circle.y} A ${circle.r} ${circle.r} 0 1 1 ${circle.x + circle.r} ${circle.y}`);
        continue;
      }
      const x0 = circle.x + circle.r * Math.cos(start);
      const y0 = circle.y + circle.r * Math.sin(start);
      const x1 = circle.x + circle.r * Math.cos(end);
      const y1 = circle.y + circle.r * Math.sin(end);
      parts.push(`M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${circle.r} ${circle.r} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`);
    }
  });
  return parts.join(" ");
}

// TEXT TONE — labels must read against the picture under the map. The picture's average
// brightness picks dark or light text; a halo around every letter covers the busy parts.
function useBackgroundTone(url: string | null): "light" | "dark" | null {
  const [tone, setTone] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    setTone(null);
    if (!url) return;
    let cancelled = false;
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 24;
        canvas.height = 24;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(image, 0, 0, 24, 24);
        const pixels = context.getImageData(0, 0, 24, 24).data;
        let sum = 0;
        for (let index = 0; index < pixels.length; index += 4) sum += 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
        if (!cancelled) setTone(sum / (pixels.length / 4) > 140 ? "light" : "dark");
      } catch {
        /* an unreadable picture keeps the default text */
      }
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return tone;
}

// VIEW — zoom 1 fits the whole map; higher values look closer at (cx, cy) in map units, lower
// values show the map smaller with room around it.
type View = { zoom: number; cx: number; cy: number };
const ZOOM_MIN = 0.25;
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
  pictureOpacity = 1,
  onPictureOpacity,
  mode,
  tool = "move",
  brushRadius = 0,
  selectedId = null,
  shownId = null,
  onPartyDrop,
  onBrush,
  onBrushEnd,
  onPlace,
  onCancelTool,
  onGroundContext,
  onTokenSelect,
  onTokenDrop,
  onTokenContext,
  onMemberDrop,
  onPartySelect,
  onGroundClick,
  onFeatureSelect,
  linkedFeatures = [],
  focus = null,
  revealFocus = null,
  barExtras = null,
}: MapCanvasProps) {
  const maskId = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const brushingRef = useRef(false);

  // STATE
  const [drag, setDrag] = useState<Drag>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 }); // the container's size, for keeping text readable
  const [view, setView] = useState<View>({ zoom: 1, cx: data.width / 2, cy: data.height / 2 });
  // Player display: false while the view follows the party (centered on it, at the chosen zoom),
  // true once someone pans it away.
  const [isFree, setIsFree] = useState(false);
  // The action bar is open on the DM's map and folded on the player display; the choice is kept per screen.
  const [isBarOpen, setIsBarOpen] = useState(mode === "dm");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`orc-bar-${mode}`);
      if (saved === "open" || saved === "closed") setIsBarOpen(saved === "open");
      else if (window.innerWidth < 700) setIsBarOpen(false);
    } catch {
      if (window.innerWidth < 700) setIsBarOpen(false);
    }
  }, [mode]);
  function changeBarOpen(open: boolean) {
    setIsBarOpen(open);
    try {
      localStorage.setItem(`orc-bar-${mode}`, open ? "open" : "closed");
    } catch {
      /* storage can be blocked; the change still applies */
    }
  }
  const [cinema, setCinema] = useState<{ x: number; y: number; zoom: number } | null>(null); // a camera move that overrides the view
  const [revealing, setRevealing] = useState<{ id: string; phase: "pending" | "show"; x: number; y: number } | null>(null);
  const latestRef = useRef<{ party: { x: number; y: number }; view: View; isFollowing: boolean }>({ party: { x: partyX, y: partyY }, view: { zoom: 1, cx: 0, cy: 0 }, isFollowing: true });
  const panRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const pinchRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const didPanRef = useRef(false); // the pointer travelled, so the release is not a tap
  const tapRef = useRef<{ pointerId: number; x: number; y: number; px: number; py: number } | null>(null);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const isDm = mode === "dm";
  const pictureTone = useBackgroundTone(backgroundUrl);
  // The ground behind the map: the theme's, or black or white by the toggle (kept per screen).
  const [ground, setGround] = useState<"black" | "white" | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`orc-ground-${mode}`);
      if (saved === "black" || saved === "white") setGround(saved);
    } catch {
      /* storage can be blocked; the theme's ground stands */
    }
  }, [mode]);
  function toggleGround() {
    const next = ground === "black" ? "white" : "black";
    setGround(next);
    try {
      localStorage.setItem(`orc-ground-${mode}`, next);
    } catch {
      /* storage can be blocked; the change still applies */
    }
  }
  const groundTone = ground === "white" ? "light" : ground === "black" ? "dark" : null;
  const tone = backgroundUrl && pictureOpacity >= 0.5 ? pictureTone ?? groundTone : groundTone ?? pictureTone;
  const party = drag?.kind === "party" ? { x: drag.x, y: drag.y } : { x: partyX, y: partyY };
  const memberPositions = members.map((member) => (drag?.kind === "member" && drag.id === member.id ? { ...member, x: drag.x, y: drag.y } : member));
  // Everything the players see from: the party token and each member standing apart.
  const sightPoints = [party, ...memberPositions.map((member) => ({ x: member.x, y: member.y }))];
  const isFollowing = !isDm && !isFree;
  latestRef.current = { party, view, isFollowing };

  // SNAP — party, members and entries land in the middle of a grid cell.
  function snap(x: number, y: number): { x: number; y: number } {
    const cell = (value: number, limit: number) => Math.min(limit - MAP_GRID / 2, Math.max(MAP_GRID / 2, Math.floor(value / MAP_GRID) * MAP_GRID + MAP_GRID / 2));
    return { x: cell(x, data.width), y: cell(y, data.height) };
  }

  // Track the container's size.
  useEffect(() => {
    const element = wrapRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setBox({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // ZOOM — about a map point (the cursor, or the view's center). Following the party, the zoom is
  // always about the party, so the view stays centered on it.
  function zoomTo(zoom: number, about?: { x: number; y: number }) {
    setView((current) => {
      const next = clampZoom(zoom);
      if (next === current.zoom) return current;
      if (isFollowing || !about) return { ...current, zoom: next };
      const ratio = current.zoom / next;
      return { zoom: next, cx: about.x + (current.cx - about.x) * ratio, cy: about.y + (current.cy - about.y) * ratio };
    });
  }

  function panBy(dx: number, dy: number) {
    setView((current) => ({ ...current, cx: current.cx + dx, cy: current.cy + dy }));
  }

  // On the player display the first pan lets go of the party, starting from where the view was.
  function takeOver() {
    if (isDm || isFree) return;
    setView((current) => ({ ...current, cx: party.x, cy: party.y }));
    setIsFree(true);
  }

  // Wheel zoom is registered by hand: React's onWheel is passive, so it cannot stop the page scroll.
  const followingRef = useRef(isFollowing);
  followingRef.current = isFollowing;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const matrix = svg.getScreenCTM();
      const point = matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.03 : 0.0015));
      setView((current) => {
        const next = clampZoom(current.zoom * factor);
        if (next === current.zoom) return current;
        if (followingRef.current || !point) return { ...current, zoom: next };
        const ratio = current.zoom / next;
        return { zoom: next, cx: point.x + (current.cx - point.x) * ratio, cy: point.y + (current.cy - point.y) * ratio };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // A different map starts fitted (and, on the display, following the party again).
  useEffect(() => {
    setView({ zoom: 1, cx: data.width / 2, cy: data.height / 2 });
    setIsFree(false);
  }, [data.width, data.height]);

  // ZOOM TO — a request from the details panel or the right-click menu
  useEffect(() => {
    if (!focus || !isDm) return;
    setView({ zoom: FOCUS_ZOOM, cx: focus.x, cy: focus.y });
  }, [focus, isDm]);

  // REVEAL — the camera pulls back until the party and the revealed entry are both in view, the
  // entry's icon and nameplate play their reveal, then the camera returns to where it was.
  const dataSizeRef = useRef({ width: data.width, height: data.height });
  dataSizeRef.current = { width: data.width, height: data.height };
  useEffect(() => {
    if (!revealFocus || isDm) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let frame = 0;
    let cancelled = false;
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const { party: partyNow, view: viewNow, isFollowing: followingNow } = latestRef.current;
    const from = followingNow ? { x: partyNow.x, y: partyNow.y, zoom: viewNow.zoom } : { x: viewNow.cx, y: viewNow.cy, zoom: viewNow.zoom };
    const { width, height } = dataSizeRef.current;
    const spanX = Math.abs(revealFocus.x - partyNow.x) * 1.7 + 260;
    const spanY = Math.abs(revealFocus.y - partyNow.y) * 1.7 + 200;
    const fit = Math.max(ZOOM_MIN, Math.min(from.zoom, width / spanX, height / spanY));
    const to = { x: (partyNow.x + revealFocus.x) / 2, y: (partyNow.y + revealFocus.y) / 2, zoom: fit };
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const tween = (a: typeof from, b: typeof from, ms: number, done: () => void) => {
      const start = performance.now();
      const step = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - start) / ms);
        const k = ease(t);
        // zoom moves on a log scale so the pull-back feels even
        setCinema({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * k) });
        if (t < 1) frame = requestAnimationFrame(step);
        else done();
      };
      frame = requestAnimationFrame(step);
    };
    setRevealing({ id: revealFocus.id, phase: "pending", x: revealFocus.x, y: revealFocus.y });
    const cameraMs = reduced ? 0 : 1100;
    const begin = () => {
      timers.push(setTimeout(() => setRevealing({ id: revealFocus.id, phase: "show", x: revealFocus.x, y: revealFocus.y }), 150));
      timers.push(
        setTimeout(() => {
          if (reduced) {
            setCinema(null);
            setRevealing(null);
            return;
          }
          tween(to, from, 950, () => {
            setCinema(null);
            setRevealing(null);
          });
        }, 3900)
      );
    };
    if (cameraMs === 0) {
      setCinema(to);
      begin();
    } else {
      tween(from, to, cameraMs, begin);
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      setCinema(null);
      setRevealing(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealFocus?.nonce, isDm]);

  // VIEW BOX — always the map's shape, so zoom 1 shows the whole map. The player display centers
  // on the party while following; anywhere else the view may be dragged a little past the map's
  // edge.
  const cameraZoom = cinema ? cinema.zoom : view.zoom;
  const viewWidth = data.width / cameraZoom;
  const viewHeight = data.height / cameraZoom;
  let originX: number;
  let originY: number;
  if (cinema) {
    originX = cinema.x - viewWidth / 2;
    originY = cinema.y - viewHeight / 2;
  } else if (isFollowing) {
    originX = party.x - viewWidth / 2;
    originY = party.y - viewHeight / 2;
  } else {
    originX = Math.min(Math.max(view.cx - viewWidth / 2, -viewWidth * PAN_BLEED), data.width - viewWidth * (1 - PAN_BLEED));
    originY = Math.min(Math.max(view.cy - viewHeight / 2, -viewHeight * PAN_BLEED), data.height - viewHeight * (1 - PAN_BLEED));
  }
  const viewBox = `${originX} ${originY} ${viewWidth} ${viewHeight}`;
  const isWindowed = view.zoom !== 1 || isFree;

  function toMapPoint(event: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: Math.min(Math.max(point.x, 0), data.width), y: Math.min(Math.max(point.y, 0), data.height) };
  }

  function startDrag(event: React.PointerEvent, kind: "party" | "token" | "member", id: string | null, x: number, y: number) {
    if (!isDm || tool !== "move" || event.button !== 0) return;
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    setDrag({ kind, id, x, y, moved: false });
  }

  function moveDrag(event: React.PointerEvent) {
    if (!drag) return;
    const point = toMapPoint(event);
    if (point) setDrag({ ...drag, ...snap(point.x, point.y), moved: true });
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
    if (event.button === 2 || cinema) return;
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
    // The player display: any drag looks around.
    if (!isDm) {
      didPanRef.current = false;
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
      panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      return;
    }
    if (tool === "move" && event.button === 0) tapRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, px: point.x, py: point.y };
    // Middle button, or the move tool on empty ground, drags the view when it is not the whole map.
    if (event.button === 1 || tool === "move") {
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
      panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      return;
    }
    if (tool === "reveal" || tool === "hide") {
      brushingRef.current = true;
      (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
      onBrush?.(point.x, point.y);
    } else if (tool === "place") {
      const cell = snap(point.x, point.y);
      onPlace?.(cell.x, cell.y);
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
    const scale = Math.min(box.width / viewWidth, box.height / viewHeight);
    return scale > 0 ? 1 / scale : 1;
  }

  const isBrushTool = isDm && (tool === "reveal" || tool === "hide");
  const isPlaceTool = isDm && tool === "place";

  function backgroundMove(event: React.PointerEvent) {
    if ((isBrushTool || isPlaceTool) && event.pointerType !== "touch") setHover(toMapPoint(event));
    if (pinchRef.current.has(event.pointerId)) {
      pinchRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchRef.current.size === 2 && pinchStartRef.current && pinchStartRef.current.distance > 0) {
        zoomTo(pinchStartRef.current.zoom * (pinchDistance() / pinchStartRef.current.distance));
        return;
      }
    }
    const pan = panRef.current;
    if (pan && pan.pointerId === event.pointerId) {
      // On the player display a press only lets go of the party once it has travelled a few pixels,
      // so a tap on an object leaves the camera where it is.
      if (!isDm && !pan.moved && Math.hypot(event.clientX - pan.x, event.clientY - pan.y) < 5) return;
      if (!isDm) {
        didPanRef.current = true;
        takeOver();
      }
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
    const tap = tapRef.current;
    if (tap && tap.pointerId === event.pointerId) {
      tapRef.current = null;
      if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 5) onGroundClick?.(tap.px, tap.py);
    }
    if (pinchRef.current.delete(event.pointerId) && pinchRef.current.size < 2) pinchStartRef.current = null;
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
      return;
    }
    if (!brushingRef.current) return;
    brushingRef.current = false;
    onBrushEnd?.();
  }

  // RIGHT-CLICK — cancels placing; on an entry it opens that entry's menu (the DM's map only).
  function contextMenu(event: React.MouseEvent) {
    if (!isDm) return;
    event.preventDefault();
    if (tool !== "move") {
      onCancelTool?.();
      return;
    }
    const target = (event.target as Element).closest("[data-token-id]");
    const id = target?.getAttribute("data-token-id");
    if (id) {
      onTokenContext?.(id, event.clientX, event.clientY);
      return;
    }
    const point = toMapPoint(event);
    if (point) onGroundContext?.(point.x, point.y, event.clientX, event.clientY);
  }

  // Text is sized in map units, but never smaller than 11 screen pixels, however far out the view is.
  const pxPerUnit = box.width > 0 && box.height > 0 ? Math.min(box.width / viewWidth, box.height / viewHeight) : 1;
  // The scale is snapped to steps of 15% so label sizes, and with them the overlap decisions, hold
  // still while the wheel or a pinch zooms smoothly and only change when a step is crossed.
  const steppedPx = 1.15 ** Math.round(Math.log(pxPerUnit) / Math.log(1.15));
  const labelSize = Math.max(data.width / 80, 11 / steppedPx);
  const haloWidth = 2.4 / steppedPx;
  const cover = { x: -data.width * 4, y: -data.height * 4, width: data.width * 9, height: data.height * 9 };
  const picture = data.background ?? { x: 0, y: 0, w: data.width, h: data.height };

  // OUTLINES — only the outer edge of the explored area and of what is in sight now
  const outlines = useMemo(() => {
    if (!isDm) return null;
    const seen = sightPoints.map((point) => ({ x: point.x, y: point.y, r: visionRadius }));
    return { explored: outlinePath(explored, seen), visible: outlinePath(seen) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDm, explored, visionRadius, party.x, party.y, memberPositions.map((member) => `${member.x},${member.y}`).join("|")]);

  // LABEL PLACEMENT — one pass over everything that carries text
  const baseOf = (token: MapToken) => (drag?.kind === "token" && drag.id === token.id ? { x: drag.x, y: drag.y } : { x: token.x, y: token.y });
  const isSeen = (token: MapToken) => !isDm || token.revealed || isVisibleFrom(sightPoints, visionRadius, baseOf(token).x, baseOf(token).y);

  // STACKS — entries in the same grid cell are fanned out around the cell's middle, smaller, so
  // none hides another (or the party). Where they are drawn is a display matter only: dragging,
  // vision and saving all use the real position.
  const spread = useMemo(() => {
    const cellOf = (x: number, y: number) => `${Math.floor(x / MAP_GRID)},${Math.floor(y / MAP_GRID)}`;
    const occupied = new Set([cellOf(party.x, party.y), ...memberPositions.map((member) => cellOf(member.x, member.y))]);
    const groups = new Map<string, MapToken[]>();
    for (const token of tokens) {
      const base = drag?.kind === "token" && drag.id === token.id ? { x: drag.x, y: drag.y } : { x: token.x, y: token.y };
      const key = cellOf(base.x, base.y);
      groups.set(key, [...(groups.get(key) ?? []), token]);
    }
    const result = new Map<string, { x: number; y: number; scale: number }>();
    for (const [key, group] of groups) {
      const crowded = group.length > 1 || occupied.has(key);
      const [cx, cy] = key.split(",").map(Number);
      const middle = { x: cx * MAP_GRID + MAP_GRID / 2, y: cy * MAP_GRID + MAP_GRID / 2 };
      group.forEach((token, index) => {
        const base = drag?.kind === "token" && drag.id === token.id ? { x: drag.x, y: drag.y } : { x: token.x, y: token.y };
        if (!crowded) {
          result.set(token.id, { ...base, scale: 1 });
          return;
        }
        const angle = -Math.PI / 2 + (index * TAU) / group.length + (group.length === 1 ? Math.PI / 4 : 0);
        const radius = MAP_GRID * (group.length > 8 ? 0.4 : occupied.has(key) ? 0.34 : 0.28);
        result.set(token.id, { x: middle.x + Math.cos(angle) * radius, y: middle.y + Math.sin(angle) * radius, scale: 0.7 });
      });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, drag, party.x, party.y, memberPositions.map((member) => `${member.x},${member.y}`).join("|")]);
  const positionOf = (token: MapToken) => spread.get(token.id) ?? { ...baseOf(token), scale: 1 };
  const scaleOf = (token: MapToken) => positionOf(token).scale;
  // Whether a point is inside the explored area or in sight right now.
  const isRevealedAt = (x: number, y: number) =>
    explored.some((circle) => Math.hypot(circle.x - x, circle.y - y) <= circle.r) || isVisibleFrom(sightPoints, visionRadius, x, y);
  const labelRequests: LabelRequest[] = [
    { key: "party", x: party.x, y: party.y + labelSize * 2.4, text: "PARTY", size: labelSize, centered: true, priority: 0, canHide: false },
    ...memberPositions.map((member) => ({ key: `m:${member.id}`, x: member.x, y: member.y + labelSize * 2, text: member.name, size: labelSize * 0.85, centered: true, priority: 0, canHide: false })),
    ...tokens
      .filter((token) => token.kind !== "place")
      .map((token) => {
        const position = positionOf(token);
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

  const visibleTokens = tokens.filter((token) => token.kind !== "place");

  return (
    // MAP WRAPPER
    <div
      ref={wrapRef}
      className="orc-map"
      data-mode={mode}
      data-tool={isDm ? tool : undefined}
      data-zoomed={isWindowed ? "true" : undefined}
      data-picture={backgroundUrl ? "true" : undefined}
      data-tone={tone ?? undefined}
      data-ground={ground ?? undefined}
    >

      {/* ACTION BAR — one small button that opens the map's controls: on the DM's map the sliders,
          zoom and background; on the player display follow, zoom and background opacity. */}
      <div className="orc-bar-float" data-mode={mode} data-open={isBarOpen ? "true" : undefined}>
        <div className="orc-bar-panel" role="group" aria-label="Map controls" aria-hidden={!isBarOpen} data-open={isBarOpen ? "true" : undefined} inert={!isBarOpen}>
          {isDm && barExtras}
          {!isDm && isFree && (
            <button type="button" className="orc-zoom-btn orc-zoom-follow" title="Center on the party" aria-label="Follow party" onClick={() => setIsFree(false)}>
              <Crosshair className="w-4 h-4" /> Follow party
            </button>
          )}

          {/* ZOOM — Shift+click steps by 2% instead of 10%; the wheel and a pinch are continuous */}
          <div className="orc-zoom" role="group" aria-label="Map zoom">
            <button type="button" className="orc-zoom-btn" disabled={view.zoom <= ZOOM_MIN} title="Zoom out (Shift for a fine step)" aria-label="Zoom out" onClick={(event) => zoomTo(view.zoom / (event.shiftKey ? ZOOM_FINE_STEP : ZOOM_STEP))}>
              <Minus className="w-4 h-4" />
            </button>
            <span className="orc-zoom-value" aria-live="polite">{Math.round(view.zoom * 100)}%</span>
            <button type="button" className="orc-zoom-btn" disabled={view.zoom >= ZOOM_MAX} title="Zoom in (Shift for a fine step)" aria-label="Zoom in" onClick={(event) => zoomTo(view.zoom * (event.shiftKey ? ZOOM_FINE_STEP : ZOOM_STEP))}>
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="orc-zoom-btn"
              disabled={isDm ? view.zoom === 1 && view.cx === data.width / 2 && view.cy === data.height / 2 : view.zoom === 1}
              title="Fit the whole map"
              aria-label="Fit the whole map"
              onClick={() => (isDm ? setView({ zoom: 1, cx: data.width / 2, cy: data.height / 2 }) : zoomTo(1))}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          <button type="button" className="orc-zoom-btn" title="Black or white background" aria-label="Toggle black or white background" aria-pressed={ground === "white"} onClick={toggleGround}>
            <Contrast className="w-4 h-4" />
          </button>
          {!isDm && backgroundUrl && onPictureOpacity && (
            <label className="orc-bar-slider">
              <span className="orc-label">Background</span>
              <input type="range" min={0} max={100} value={Math.round(pictureOpacity * 100)} aria-label="Background opacity" onChange={(event) => onPictureOpacity(Number(event.target.value) / 100)} />
              <RangeValue value={Math.round(pictureOpacity * 100)} min={0} max={100} suffix="%" label="Background opacity" onCommit={(value) => onPictureOpacity(value / 100)} />
            </label>
          )}
        </div>
        <button type="button" className="orc-zoom-btn orc-bar-toggle" title={isBarOpen ? "Hide the controls" : "Map controls"} aria-label={isBarOpen ? "Hide the map controls" : "Show the map controls"} aria-expanded={isBarOpen} onClick={() => changeBarOpen(!isBarOpen)}>
          {isBarOpen ? <X className="w-4 h-4" /> : <SlidersHorizontal className="w-4 h-4" />}
        </button>
      </div>

      {/* MAP DRAWING */}
      <svg
        ref={svgRef}
        className="orc-map-svg"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Map"
        style={{ "--orc-halo-w": `${haloWidth}px` } as React.CSSProperties}
        onPointerDown={backgroundDown}
        onPointerMove={backgroundMove}
        onPointerUp={backgroundUp}
        onPointerCancel={backgroundUp}
        onPointerLeave={() => setHover(null)}
        onContextMenu={contextMenu}
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

        {/* BACKGROUND PICTURE — where the DM aligned it; features are drawn lightly over it */}
        {backgroundUrl && <image className="orc-map-picture" href={backgroundUrl} x={picture.x} y={picture.y} width={picture.w} height={picture.h} preserveAspectRatio="none" opacity={pictureOpacity} />}

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
              <g key={feature.id} className="orc-feature" data-type={feature.type} data-state={feature.state} data-link={linkedFeatures.includes(feature.id) ? "true" : undefined} onPointerDown={!isDm && linkedFeatures.includes(feature.id) ? (event) => event.stopPropagation() : undefined} onClick={!isDm && linkedFeatures.includes(feature.id) ? () => { if (!didPanRef.current) onFeatureSelect?.(feature.id); } : undefined}>
                {feature.type === "landmark" ? (
                  <ellipse cx={feature.x + feature.w / 2} cy={feature.y + feature.h / 2} rx={feature.w / 2} ry={feature.h / 2} />
                ) : (
                  <rect x={feature.x} y={feature.y} width={feature.w} height={feature.h} />
                )}
                {feature.state !== "intact" && feature.type === "building" && (
                  <rect className="orc-feature-rubble" x={feature.x + feature.w * 0.25} y={feature.y + feature.h * 0.35} width={feature.w * 0.5} height={feature.h * 0.4} />
                )}
              </g>
            ))
        )}

        {/* CREATURES AND PEOPLE THE PARTY CANNOT SEE (the DM's map only) — under the fog, so the
            tint itself shows what is hidden */}
        {visibleTokens.filter((token) => !isSeen(token)).map((token) => {
          const position = positionOf(token);
          return (
            <g
              key={token.id}
              className="orc-token"
              data-token-id={isDm ? token.id : undefined}
              data-attitude={token.attitude}
              data-selected={selectedId === token.id ? "true" : undefined}
              data-shown={shownId === token.id ? "true" : undefined}
              data-hidden="true"
              onPointerDown={(event) => (isDm ? startDrag(event, "token", token.id, baseOf(token).x, baseOf(token).y) : event.stopPropagation())}
              onClick={!isDm ? () => onTokenSelect?.(token.id) : undefined}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={() => setDrag(null)}
            >
              <circle cx={position.x} cy={position.y} r={labelSize * 0.8 * position.scale} />
              <text x={position.x + labelSize * 1.2} y={position.y + labelSize * 0.35 + labelAt(`t:${token.id}`).dy} fontSize={labelSize}>
                {token.name} · hidden
              </text>
            </g>
          );
        })}

        {/* FOG — out of sight (dim), then never seen (solid on the player display) */}
        <rect className="orc-fog-dim" {...cover} mask={`url(#${maskId}-dim)`} />
        <rect className="orc-fog-unexplored" {...cover} mask={`url(#${maskId}-unexplored)`} />

        {/* NAMEPLATES — every name of something the party has seen or can see is drawn above the fog,
            in full (the DM sees them all) */}
        <g className="orc-feature-labels" pointerEvents="none">
          {data.features
            .filter((feature) => feature.name && (feature.type === "building" || feature.type === "landmark") && !labelAt(`f:${feature.id}`).hidden)
            .filter((feature) => isDm || isRevealedAt(feature.x + feature.w / 2, feature.y + feature.h / 2))
            .map((feature) => (
              <text
                key={feature.id}
                className="orc-feature-label"
                data-type={feature.type}
                data-state={feature.state}
                x={feature.x + 5}
                y={(feature.type === "landmark" ? feature.y - 5 : feature.y + labelSize + 3) + labelAt(`f:${feature.id}`).dy}
                fontSize={labelSize}
              >
                {feature.name.toUpperCase()}
              </text>
            ))}
        </g>

        {/* WHAT THE PARTY SEES — above the fog, name in full */}
        {visibleTokens.filter(isSeen).map((token) => {
          const position = positionOf(token);
          return (
            <g
              key={token.id}
              className="orc-token"
              data-token-id={isDm ? token.id : undefined}
              data-attitude={token.attitude}
              data-selected={selectedId === token.id ? "true" : undefined}
              data-shown={shownId === token.id ? "true" : undefined}
              data-reveal={revealing?.id === token.id ? revealing.phase : undefined}
              onPointerDown={(event) => (isDm ? startDrag(event, "token", token.id, baseOf(token).x, baseOf(token).y) : event.stopPropagation())}
              onClick={!isDm ? () => onTokenSelect?.(token.id) : undefined}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={() => setDrag(null)}
            >
              <circle cx={position.x} cy={position.y} r={labelSize * 0.8 * position.scale} />
              <text className="orc-token-name" data-attitude={token.attitude} x={position.x + labelSize * 1.2} y={position.y + labelSize * 0.35 + labelAt(`t:${token.id}`).dy} fontSize={labelSize}>
                {token.name}
              </text>
            </g>
          );
        })}

        {/* REVEAL RINGS — pulses spreading from the entry as it is revealed */}
        {revealing?.phase === "show" && (
          <g className="orc-reveal-rings" pointerEvents="none">
            {[0, 1, 2].map((index) => (
              <circle key={index} cx={revealing.x} cy={revealing.y} r={labelSize * 0.8} style={{ animationDelay: `${index * 0.45}s` }} />
            ))}
          </g>
        )}

        {/* DM OUTLINES — where the players' view ends */}
        {outlines && (
          <g className="orc-fog-outline">
            <path className="orc-fog-outline-explored" d={outlines.explored} />
            <path className="orc-fog-outline-visible" d={outlines.visible} />
          </g>
        )}

        {/* PLACE PINS — DM only, above the fog so they stay readable */}
        {isDm &&
          tokens
            .filter((token) => token.kind === "place")
            .map((token) => {
              const position = positionOf(token);
              const size = labelSize * 1.7 * position.scale;
              return (
                <g
                  key={token.id}
                  className="orc-pin"
                  data-token-id={token.id}
                  data-selected={selectedId === token.id ? "true" : undefined}
                  data-shown={shownId === token.id ? "true" : undefined}
                  onPointerDown={(event) => (isDm ? startDrag(event, "token", token.id, baseOf(token).x, baseOf(token).y) : event.stopPropagation())}
              onClick={!isDm ? () => onTokenSelect?.(token.id) : undefined}
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

        {/* PLACE PREVIEW — the grid cell the entry would land in */}
        {isPlaceTool && hover && (() => {
          const cell = snap(hover.x, hover.y);
          return <rect className="orc-place-cell" x={cell.x - MAP_GRID / 2} y={cell.y - MAP_GRID / 2} width={MAP_GRID} height={MAP_GRID} />;
        })()}

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
