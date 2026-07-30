// Shared resolver for the customizable Nutrition section. Both the dashboard
// (HomeClient) and the Customize Dashboard editor turn a stored card key into a
// renderable card spec (label / value / target / color) given the day's totals,
// the macro target, and the nutrient reference + resolved bands. Keeping this in
// one place means the editor's preview and the live dashboard can never drift.

import { DailyTotals } from "../../types/entry";
import { MacroTarget } from "../../types/target";
import { Nutrient, ResolvedNutrientTarget } from "../../types/food";
import {
  FAT_BREAKDOWN_CODES,
  CARB_BREAKDOWN_CODES,
  PROTEIN_BREAKDOWN_CODES,
} from "../../utils/nutrientGroups";
import { MACROS, byNutrientOrder } from "../../utils/nutrientLedger";

export interface ResolvedCard {
  key: string;
  label: string;
  subtitle: string;
  unit: string;
  value: number; // consumed today (macros card: today's kcal, subtitle says 7-day in MF — kept "Last 7 Days")
  // Full floor/target/ceiling band so the dashboard tile can render the same
  // goal/range/limit meter (NutrientMeter) as the Nutrition page — each marker
  // is independent (null = absent), NOT collapsed into a single "target".
  floor: number | null;
  target: number | null;
  ceiling: number | null;
  isCustom: boolean; // band is a program override (source === 'manual') → bullseye glyph
  color: string; // CSS var() token — never a hardcoded color
}

// Static metadata for the synthetic macro cards (not rows in `nutrients`).
// Sourced from the ledger's MACROS (label/unit/color) so there's one macro
// definition; the dashboard-specific "Today" subtitle is added here.
const MACRO_META: Record<string, { label: string; subtitle: string; unit: string; color: string }> =
  Object.fromEntries(
    MACROS.map((m) => [m.key, { label: m.label, subtitle: "Today", unit: m.unit, color: m.color }])
  );

// Swatch color for a nutrient card, grouped by macro family / category so the
// dashboard reads coherently (sugars green with carbs, sat fat purple with fat).
export function nutrientCardColor(n: Nutrient): string {
  if (FAT_BREAKDOWN_CODES.has(n.code)) return "var(--fg-fat)";
  if (CARB_BREAKDOWN_CODES.has(n.code)) return "var(--fg-carb)";
  if (PROTEIN_BREAKDOWN_CODES.has(n.code)) return "var(--fg-protein)";
  if (n.category === "vitamin") return "var(--fg-vitamin)";
  if (n.category === "mineral") return "var(--fg-mineral)";
  return "var(--fg-other)";
}

const macroTotal = (key: string, totals: DailyTotals): number => {
  switch (key) {
    case "kcal":
      return totals.kcal;
    case "protein":
      return totals.protein_g;
    case "fat":
      return totals.fat_g;
    case "carbs":
      return totals.carbs_g;
    default:
      return 0;
  }
};

const macroTarget = (key: string, target: MacroTarget | null): number | null => {
  if (!target) return null;
  switch (key) {
    case "kcal":
      return target.kcal;
    case "protein":
      return target.protein_g;
    case "fat":
      return target.fat_g;
    case "carbs":
      return target.carbs_g;
    default:
      return null;
  }
};

export interface ResolveContext {
  totals: DailyTotals;
  target: MacroTarget | null;
  nutrients: Nutrient[];
  bands: ResolvedNutrientTarget[];
}

// Turn one card key into a renderable spec, or null if it can't be resolved yet
// (e.g. a nutrient card before the nutrient list has loaded, or an unknown key).
export function resolveNutritionCard(key: string, ctx: ResolveContext): ResolvedCard | null {
  const macro = MACRO_META[key];
  if (macro) {
    return {
      key,
      label: macro.label,
      subtitle: macro.subtitle,
      unit: macro.unit,
      value: Math.round(macroTotal(key, ctx.totals)),
      // Macros carry a single goal (no floor/ceiling band) — the meter draws a
      // lone target caret + tick.
      floor: null,
      target: macroTarget(key, ctx.target),
      ceiling: null,
      isCustom: false,
      color: macro.color,
    };
  }

  // Micronutrient card — value from the day's micros, target from the resolved band.
  const nutrient = ctx.nutrients.find((n) => n.code === key);
  if (!nutrient) return null;
  const band = ctx.bands.find((b) => b.code === key);
  const consumed = ctx.totals.micros?.[key] ?? 0;
  // Whole numbers for mg/mcg, one decimal for grams/ml so small values still show.
  const value = nutrient.unit === "g" ? Math.round(consumed * 10) / 10 : Math.round(consumed);
  return {
    key,
    label: nutrient.name,
    subtitle: "Today",
    unit: nutrient.unit,
    value,
    // Keep each marker distinct so the meter places floor/target/ceiling
    // independently (a ceiling-only nutrient must NOT draw a target at the cap).
    floor: band?.floor ?? null,
    target: band?.target ?? null,
    ceiling: band?.ceiling ?? null,
    isCustom: band?.source === "manual",
    color: nutrientCardColor(nutrient),
  };
}

// Build the grouped catalog of every card a user can add, for the "Add or Remove
// Nutrients" picker. Macros first, then nutrient buckets in their canonical order.
export interface CardCatalogEntry {
  key: string;
  label: string;
  color: string;
  unit: string;
}
export interface CardCatalogGroup {
  heading: string;
  entries: CardCatalogEntry[];
}

export function buildCardCatalog(nutrients: Nutrient[]): CardCatalogGroup[] {
  const groups: CardCatalogGroup[] = [];

  // MACROS GROUP — the synthetic cards (in ledger MACROS order).
  groups.push({
    heading: "Macros",
    entries: MACROS.map((m) => ({
      key: m.key,
      label: MACRO_META[m.key].label,
      color: MACRO_META[m.key].color,
      unit: MACRO_META[m.key].unit,
    })),
  });

  // Sort within each bucket by the ledger's canonical order, not DB display_order.
  const claimed = new Set<string>([...FAT_BREAKDOWN_CODES, ...CARB_BREAKDOWN_CODES, ...PROTEIN_BREAKDOWN_CODES]);
  const entriesFor = (filter: (n: Nutrient) => boolean): CardCatalogEntry[] =>
    nutrients
      .filter(filter)
      .sort(byNutrientOrder)
      .map((n) => ({ key: n.code, label: n.name, color: nutrientCardColor(n), unit: n.unit }));

  const buckets: { heading: string; filter: (n: Nutrient) => boolean }[] = [
    { heading: "Fat Breakdown", filter: (n) => FAT_BREAKDOWN_CODES.has(n.code) },
    { heading: "Carb Breakdown", filter: (n) => CARB_BREAKDOWN_CODES.has(n.code) },
    { heading: "Protein Breakdown", filter: (n) => PROTEIN_BREAKDOWN_CODES.has(n.code) },
    { heading: "Vitamins", filter: (n) => n.category === "vitamin" },
    { heading: "Minerals", filter: (n) => n.category === "mineral" },
    { heading: "Other", filter: (n) => n.category === "other" && !claimed.has(n.code) },
  ];

  for (const bucket of buckets) {
    const entries = entriesFor(bucket.filter);
    if (entries.length > 0) groups.push({ heading: bucket.heading, entries });
  }

  return groups;
}
