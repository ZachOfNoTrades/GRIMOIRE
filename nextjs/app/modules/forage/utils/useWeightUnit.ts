"use client";

import { useEffect, useState } from "react";
import { WeightUnit } from "./units";

// Module-scoped cache so multiple consumers in one render don't all refetch.
// The settings endpoint is idempotent and cheap, but a single fetch per page
// load is plenty.
let cached: WeightUnit | null = null;
let inflight: Promise<WeightUnit> | null = null;

async function loadOnce(): Promise<WeightUnit> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = fetch(`/modules/forage/api/settings`)
    .then((r) => (r.ok ? r.json() : { weight_unit: "lbs" }))
    .then((s: { weight_unit?: WeightUnit }) => {
      const next: WeightUnit = s.weight_unit === "kg" ? "kg" : "lbs";
      cached = next;
      inflight = null;
      return next;
    })
    .catch(() => {
      inflight = null;
      return "lbs" as WeightUnit;
    });
  return inflight;
}

export function invalidateWeightUnit(next: WeightUnit) {
  cached = next;
}

export function useWeightUnit(): WeightUnit {
  const [unit, setUnit] = useState<WeightUnit>(cached ?? "lbs");
  useEffect(() => {
    let alive = true;
    loadOnce().then((u) => {
      if (alive) setUnit(u);
    });
    return () => {
      alive = false;
    };
  }, []);
  return unit;
}
