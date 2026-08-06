import { Nutrient } from "../types/food";
import { MACRO_BREAKDOWN_SCHEME, isMacroKey, type NutrientCode } from "./nutrientLedger";

// Macro-breakdown buckets — the sub-nutrients that roll up under each macro, so
// nutrient lists read as Fat / Carb / Protein breakdown sections (à la
// MacroFactor) instead of one lumped "Nutrient Breakdown".
//
// These are now DERIVED from the nutrient ledger's macro-breakdown scheme so the
// ledger stays the single source of truth for membership + order. Kept as named
// Sets + NUTRIENT_BUCKETS so existing importers (NutritionClient, nutritionCards,
// _diary) don't change; the scheme owns what's in each bucket.
const microCodesOf = (heading: string): Set<string> =>
  new Set<string>(
    (MACRO_BREAKDOWN_SCHEME.sections.find((s) => s.heading === heading)?.items ?? [])
      .filter((item): item is NutrientCode => !isMacroKey(item))
  );

export const FAT_BREAKDOWN_CODES = microCodesOf("Fat Breakdown");
export const CARB_BREAKDOWN_CODES = microCodesOf("Carb Breakdown");
export const PROTEIN_BREAKDOWN_CODES = microCodesOf("Protein Breakdown");

const CLAIMED = new Set<string>([...FAT_BREAKDOWN_CODES, ...CARB_BREAKDOWN_CODES, ...PROTEIN_BREAKDOWN_CODES]);

// Swatch color for a nutrient, grouped by macro family / category so every
// surface that plots a nutrient reads coherently (sugars green with carbs, sat
// fat purple with fat). Keyed on code + category rather than a whole `Nutrient`
// so callers holding only those two (e.g. the check-in wizard's dashboard
// review, which gets its rows from an API) can resolve the same color.
export function nutrientColorForCategory(code: string, category: string): string {
  if (FAT_BREAKDOWN_CODES.has(code)) return "var(--fg-fat)";
  if (CARB_BREAKDOWN_CODES.has(code)) return "var(--fg-carb)";
  if (PROTEIN_BREAKDOWN_CODES.has(code)) return "var(--fg-protein)";
  if (category === "vitamin") return "var(--fg-vitamin)";
  if (category === "mineral") return "var(--fg-mineral)";
  return "var(--fg-other)";
}

export interface NutrientBucket {
  heading: string;
  match: (n: Nutrient) => boolean;
}

// Ordered buckets shared by the nutrition overview page and the food-detail
// breakdown. Render in this order; hide a bucket when it has no rows. Mirrors the
// micro sections of MACRO_BREAKDOWN_SCHEME (Vitamins/Minerals key on category;
// Other is the 'other' category minus the macro-breakdown codes).
export const NUTRIENT_BUCKETS: NutrientBucket[] = [
  { heading: "Fat Breakdown", match: (n) => FAT_BREAKDOWN_CODES.has(n.code) },
  { heading: "Carb Breakdown", match: (n) => CARB_BREAKDOWN_CODES.has(n.code) },
  { heading: "Protein Breakdown", match: (n) => PROTEIN_BREAKDOWN_CODES.has(n.code) },
  { heading: "Vitamins", match: (n) => n.category === "vitamin" },
  { heading: "Minerals", match: (n) => n.category === "mineral" },
  { heading: "Other", match: (n) => n.category === "other" && !CLAIMED.has(n.code) },
];
