"use client";

import { useEffect, useState } from "react";
import type { FoodUnit } from "../types/unit";
import { normUnit, unitTypeOf, groupByUnitType, type UnitType } from "../lib/unitFamilies";

// UNIT CATALOG — /api/units returns the shared built-ins merged with the caller's own
// custom units. Module-scoped cache so every open dropdown on a page shares one fetch.
// Lives here rather than in _diary.tsx so the log-time row editor
// (components/FoodRecordRow) can read the same list without importing that module.

let cached: FoodUnit[] | null = null;
let inflight: Promise<FoodUnit[]> | null = null;
const subscribers = new Set<(units: FoodUnit[]) => void>();

export function prefetchUnits(): Promise<FoodUnit[]> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch(`/modules/forage/api/units`)
      .then(async (r) => {
        // A failed fetch is NOT cached — under memory pressure this route can 500
        // (see project_devserver_mem_sql701), and caching that would leave every
        // unit dropdown on the page empty until a full reload. Returning an
        // uncached [] lets the next consumer retry.
        if (!r.ok) return [] as FoodUnit[];
        const d = await r.json();
        cached = Array.isArray(d) ? (d as FoodUnit[]) : [];
        return cached;
      })
      .catch(() => [] as FoodUnit[])
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

// Push a fresh catalog to every mounted dropdown — called after the settings page
// (or the inline "add custom unit" flow) changes the user's custom units, so an
// open food modal picks up the new unit without a reload.
export function setUnitsCache(next: FoodUnit[]) {
  cached = next;
  subscribers.forEach((fn) => fn(next));
}

export function useUnits(): FoodUnit[] {
  const [units, setUnits] = useState<FoodUnit[]>(cached ?? []);
  useEffect(() => {
    subscribers.add(setUnits);
    if (cached) {
      setUnits(cached);
    } else {
      prefetchUnits().then((u) => setUnits(u));
    }
    return () => {
      subscribers.delete(setUnits);
    };
  }, []);
  return units;
}

// The type a unit NAME displays under. Prefers the catalog's answer (so a custom
// "shot" the user filed under Volume groups there) and falls back to deriving it
// from the conversion tables for names not in the catalog — the implicit "serving"
// row and any stale unit left on a food after its custom unit was deleted.
export function unitTypeByName(units: FoodUnit[], name: string): UnitType {
  const key = normUnit(name);
  const hit = units.find((u) => normUnit(u.name) === key);
  return hit ? hit.type : unitTypeOf(name);
}

// Bucket a list of dropdown options into <optgroup>s, or null when the list should
// stay flat. Grouping is skipped when every option falls in ONE type (a lone heading
// is pure noise) or when the list is shorter than `minItems` — a two-option picker
// reads worse with headings than without. The catalog dropdown (a dozen-plus units)
// passes 1; a food's own serving rows pass a higher floor.
export function optionGroups<T>(
  items: T[],
  typeOf: (item: T) => UnitType,
  minItems = 1
): Array<{ type: UnitType; label: string; items: T[] }> | null {
  if (items.length < minItems) return null;
  const groups = groupByUnitType(items, typeOf);
  return groups.length > 1 ? groups : null;
}

// How many unit options a food's own picker needs before group headings earn their
// space. Below this the list is short enough to scan flat.
export const SERVING_GROUP_MIN = 4;
