// Shared by server and client code — keep this file free of Node-only imports.
import type { ExploredCircle, FeatureState, FeatureType, MapData, MapFeature, PictureRect } from "../types/oracle";
import {
  FEATURE_STATES,
  FEATURE_TYPES,
  MAP_DEFAULT_HEIGHT,
  MAP_DEFAULT_WIDTH,
  MAP_DESCRIPTION_MAX,
  MAX_EXPLORED,
  MAX_FEATURES,
  SCALE_DEFAULT_UNIT,
  SCALE_DEFAULT_VALUE,
  SCALE_UNITS,
  SCALE_VALUE_MAX,
  type ScaleUnit,
} from "./constants";

const UNIT_SINGULAR: Record<ScaleUnit, string> = { feet: "foot", yards: "yard", meters: "meter", miles: "mile", kilometers: "kilometer", hours: "hour", days: "day" };

// "1 tile = 5 feet"
export function formatScale(value: number, unit: ScaleUnit): string {
  return `1 tile = ${value} ${value === 1 ? UNIT_SINGULAR[unit] : unit}`;
}

// A tile that stands for a long way (a journey) is a region map; a short one is a scene.
export function isRegionScale(value: number, unit: ScaleUnit): boolean {
  const feetPerUnit: Record<ScaleUnit, number> = { feet: 1, yards: 3, meters: 3.28, miles: 5280, kilometers: 3281, hours: 15840, days: 126720 };
  return value * feetPerUnit[unit] >= 500;
}

// Maps saved before the scale was a number and a unit carried a label ("1 square = 6 hours' walk
// (about 15 miles)") and a region/local flag. The number and unit are read back out of that.
function legacyScale(source: Record<string, unknown>): { value: number; unit: ScaleUnit } {
  const label = typeof source.scale_label === "string" ? source.scale_label.toLowerCase() : "";
  const match = label.match(/=\s*(\d+(?:\.\d+)?)\s*(feet|foot|ft|yards?|meters?|metres?|miles?|kilomet\w+|km|hours?|days?)/);
  if (match) {
    const word = match[2];
    const unit: ScaleUnit = /^(feet|foot|ft)/.test(word) ? "feet" : word.startsWith("yard") ? "yards" : /^(meter|metre)/.test(word) ? "meters" : /^(kilomet|km)/.test(word) ? "kilometers" : word.startsWith("mile") ? "miles" : word.startsWith("hour") ? "hours" : "days";
    return { value: Number(match[1]), unit };
  }
  return source.scale === "region" ? { value: 6, unit: "hours" } : { value: SCALE_DEFAULT_VALUE, unit: SCALE_DEFAULT_UNIT };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

// A picture rectangle, or null when it is missing or unusable.
export function coerceRect(raw: unknown, width: number, height: number): PictureRect | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const x = Number(item.x);
  const y = Number(item.y);
  const w = Number(item.w);
  const h = Number(item.h);
  if (![x, y, w, h].every(Number.isFinite) || w < 20 || h < 20) return null;
  return {
    x: Math.round(Math.min(width * 3, Math.max(-width * 3, x)) * 10) / 10,
    y: Math.round(Math.min(height * 3, Math.max(-height * 3, y)) * 10) / 10,
    w: Math.round(Math.min(width * 12, w) * 10) / 10,
    h: Math.round(Math.min(height * 12, h) * 10) / 10,
  };
}

// The rectangle that puts a picture of the given shape on the map: "fill" covers the map and
// crops the overflow, "fit" shows all of it, "stretch" ignores the picture's shape.
export function fitRect(mapWidth: number, mapHeight: number, aspect: number, mode: "fill" | "fit" | "stretch"): PictureRect {
  if (mode === "stretch" || !(aspect > 0)) return { x: 0, y: 0, w: mapWidth, h: mapHeight };
  const mapAspect = mapWidth / mapHeight;
  const useWidth = mode === "fill" ? aspect < mapAspect : aspect > mapAspect;
  const w = useWidth ? mapWidth : mapHeight * aspect;
  const h = useWidth ? mapWidth / aspect : mapHeight;
  return { x: (mapWidth - w) / 2, y: (mapHeight - h) / 2, w, h };
}

// Scale a rectangle by `factor` keeping the map point (px, py) where it is on screen.
export function zoomRect(rect: PictureRect, factor: number, px: number, py: number): PictureRect {
  return { x: px - (px - rect.x) * factor, y: py - (py - rect.y) * factor, w: rect.w * factor, h: rect.h * factor };
}

// Map data arrives from three untrusted places — a generation, an MCP client and the DM's own
// browser — so every read goes through this. It never throws: anything unusable is dropped or
// clamped, and the result is always a drawable map.
export function coerceMapData(raw: unknown): MapData {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const width = Math.round(clampNumber(source.width, 400, 2400, MAP_DEFAULT_WIDTH));
  const height = Math.round(clampNumber(source.height, 300, 1600, MAP_DEFAULT_HEIGHT));
  const rawValue = Number(source.scale_value);
  const hasScale = Number.isFinite(rawValue) && rawValue > 0 && SCALE_UNITS.includes(source.scale_unit as ScaleUnit);
  const scaled = hasScale ? { value: Math.min(SCALE_VALUE_MAX, Math.round(rawValue * 100) / 100), unit: source.scale_unit as ScaleUnit } : legacyScale(source);
  const background = coerceRect(source.background, width, height);
  const description = typeof source.description === "string" ? source.description.replace(/\s+/g, " ").trim().slice(0, MAP_DESCRIPTION_MAX) : "";
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

  return { width, height, scale_value: scaled.value, scale_unit: scaled.unit, scale_label: formatScale(scaled.value, scaled.unit), description, background, features };
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
  return {
    width: MAP_DEFAULT_WIDTH,
    height: MAP_DEFAULT_HEIGHT,
    scale_value: SCALE_DEFAULT_VALUE,
    scale_unit: SCALE_DEFAULT_UNIT,
    scale_label: formatScale(SCALE_DEFAULT_VALUE, SCALE_DEFAULT_UNIT),
    description: "",
    background: null,
    features: [],
  };
}
