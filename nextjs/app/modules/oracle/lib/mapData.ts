// Shared by server and client code — keep this file free of Node-only imports.
import type { ExploredCircle, FeatureState, FeatureType, MapData, MapFeature, MapScale } from "../types/oracle";
import {
  DEFAULT_SCALE_LABELS,
  FEATURE_STATES,
  FEATURE_TYPES,
  MAP_DEFAULT_HEIGHT,
  MAP_DEFAULT_WIDTH,
  MAX_EXPLORED,
  MAX_FEATURES,
  SCALE_LABEL_MAX,
} from "./constants";

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

// Map data arrives from three untrusted places — a generation, an MCP client and the DM's own
// browser — so every read goes through this. It never throws: anything unusable is dropped or
// clamped, and the result is always a drawable map.
export function coerceMapData(raw: unknown): MapData {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const width = Math.round(clampNumber(source.width, 400, 2400, MAP_DEFAULT_WIDTH));
  const height = Math.round(clampNumber(source.height, 300, 1600, MAP_DEFAULT_HEIGHT));
  const scale: MapScale = source.scale === "region" ? "region" : "local";
  const scale_label = typeof source.scale_label === "string" && source.scale_label.trim() ? source.scale_label.trim().slice(0, SCALE_LABEL_MAX) : DEFAULT_SCALE_LABELS[scale];
  const rawFeatures = Array.isArray(source.features) ? source.features.slice(0, MAX_FEATURES) : [];
  const usedIds = new Set<string>();

  const features: MapFeature[] = [];
  rawFeatures.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const item = entry as Record<string, unknown>;
    const type = FEATURE_TYPES.includes(item.type as FeatureType) ? (item.type as FeatureType) : null;
    if (!type) return;
    const w = clampNumber(item.w, 4, width * 2, 40);
    const h = clampNumber(item.h, 4, height * 2, 40);
    let id = typeof item.id === "string" && /^[a-zA-Z0-9_-]{1,40}$/.test(item.id) ? item.id : `f${index + 1}`;
    while (usedIds.has(id)) id = `${id}x`;
    usedIds.add(id);
    features.push({
      id,
      type,
      name: typeof item.name === "string" ? item.name.trim().slice(0, 60) : "",
      x: clampNumber(item.x, -width, width * 2, 0),
      y: clampNumber(item.y, -height, height * 2, 0),
      w,
      h,
      state: FEATURE_STATES.includes(item.state as FeatureState) ? (item.state as FeatureState) : "intact",
    });
  });

  return { width, height, scale, scale_label, features };
}

export function coerceExplored(raw: unknown): ExploredCircle[] {
  if (!Array.isArray(raw)) return [];
  const circles: ExploredCircle[] = [];
  for (const entry of raw.slice(0, MAX_EXPLORED)) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const x = Number(item.x);
    const y = Number(item.y);
    const r = Number(item.r);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r) || r <= 0) continue;
    circles.push({ x: Math.round(x), y: Math.round(y), r: Math.round(Math.min(r, 2000)) });
  }
  return circles;
}

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

// A blank map: an empty field with the party in the middle.
export function blankMapData(): MapData {
  return { width: MAP_DEFAULT_WIDTH, height: MAP_DEFAULT_HEIGHT, scale: "local", scale_label: DEFAULT_SCALE_LABELS.local, features: [] };
}
