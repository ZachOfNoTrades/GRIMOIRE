// ─────────────────────────────────────────────────────────────────────────────
// NUTRIENT LEDGER — single source of nutrient identity + the section schemes
// that group and order them.
//
// SCHEMA (two layers, deliberately decoupled):
//
//   1. MASTER LIST  (NUTRIENTS)
//      Pure identity: code, label, unit, category, dv, tier, labelTier, mfColumn.
//      It carries NO section and NO order. Nothing ever inherits ordering from
//      the array position here — the array is grouped only for human reading.
//
//   2. SECTION SCHEMES  (SECTION_SCHEMES)
//      A scheme is a named *view*: an ordered list of sections, each section an
//      ordered list of nutrient codes. The scheme owns BOTH grouping and sort
//      order, so the same nutrient can live in different sections in different
//      schemes (e.g. sodium → "Nutrition Facts" in the FDA scheme, → "Minerals"
//      in the macro scheme). Add a new view by adding a scheme — the master list
//      doesn't change.
//
// Every scheme must cover the master set exactly once (enforced by the dev guard
// at the bottom). `creatine` is not yet a row in the DB seed (sql_init_food.sql);
// it needs a `nutrients` row when this ledger drives the schema.
// ─────────────────────────────────────────────────────────────────────────────

export type NutrientCode =
  | "sat_fat" | "trans_fat" | "cholesterol"
  | "fiber" | "sugar_total" | "sugar_added"
  | "vit_d" | "vit_a" | "vit_c" | "vit_e" | "vit_k"
  | "thiamin" | "riboflavin" | "niacin" | "vit_b6" | "folate"
  | "vit_b12" | "biotin" | "pantothenic" | "choline"
  | "sodium" | "calcium" | "iron" | "potassium"
  | "magnesium" | "phosphorus" | "zinc" | "copper" | "manganese"
  | "selenium" | "iodine" | "chromium" | "molybdenum" | "chloride"
  | "caffeine" | "water" | "creatine";

export type NutrientCategory = "vitamin" | "mineral" | "other";
export type NutrientUnit = "g" | "mg" | "mcg" | "ml";
export type NutrientTier = "limit" | "supplement" | "reach";
export type LabelTier = "macroBlock" | "fdaRequired";

// Macros are a different data shape than nutrients: they're top-level columns on
// the food/entry (kcal, protein_g, carbs_g, fat_g), NOT rows in food_nutrients.
// They get their own list, but schemes can interleave them with micros (see
// SectionItem) so a scheme like FDA can render a faithful label.
export type MacroKey = "kcal" | "protein" | "fat" | "carbs";

export interface MacroDef {
  key: MacroKey;
  label: string;
  unit: "kcal" | "g";
  color: string;
  dv: number | null;   // reference Daily Value: grams for macros, kcal for calories (FDA 2,000)
}

export const MACROS: MacroDef[] = [
  { key: "kcal",    label: "Calories", unit: "kcal", color: "var(--fg-cal)",     dv: 2000 },
  { key: "protein", label: "Protein",  unit: "g",    color: "var(--fg-protein)", dv: 50 },
  { key: "fat",     label: "Fat",      unit: "g",    color: "var(--fg-fat)",     dv: 78 },
  { key: "carbs",   label: "Carbs",    unit: "g",    color: "var(--fg-carb)",    dv: 275 },
];

export const MACRO_BY_KEY: Record<MacroKey, MacroDef> = Object.fromEntries(
  MACROS.map((m) => [m.key, m])
) as Record<MacroKey, MacroDef>;

const MACRO_KEY_SET = new Set<MacroKey>(MACROS.map((m) => m.key));
export const isMacroKey = (k: SectionItem): k is MacroKey => MACRO_KEY_SET.has(k as MacroKey);

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1 — MASTER LIST (identity only; array order is NOT significant)
// ─────────────────────────────────────────────────────────────────────────────
export interface LedgerNutrient {
  code: NutrientCode;
  label: string;
  unit: NutrientUnit;
  category: NutrientCategory;
  dv: number | null;            // FDA 2016 Daily Value in `unit`; null = no DV
  tier: NutrientTier;           // limit (stay under) | supplement (manual) | reach
  labelTier?: LabelTier;        // macroBlock (inline w/ macros) | fdaRequired (the 4)
  mfColumn?: string;            // MacroFactor export column header (import mapping)
}

export const NUTRIENTS: LedgerNutrient[] = [
  // — fat sub-nutrients —
  { code: "sat_fat",     label: "Saturated fat",          unit: "g",   category: "other",   dv: 20,   tier: "limit", labelTier: "macroBlock", mfColumn: "Saturated Fat (g)" },
  { code: "trans_fat",   label: "Trans fat",              unit: "g",   category: "other",   dv: null, tier: "limit", labelTier: "macroBlock", mfColumn: "Trans Fat (g)" },
  { code: "cholesterol", label: "Cholesterol",            unit: "mg",  category: "other",   dv: 300,  tier: "limit", labelTier: "macroBlock", mfColumn: "Cholesterol (mg)" },
  // — carb sub-nutrients —
  { code: "fiber",       label: "Fiber",                  unit: "g",   category: "other",   dv: 28,   tier: "reach", labelTier: "macroBlock", mfColumn: "Fiber (g)" },
  { code: "sugar_total", label: "Total sugar",            unit: "g",   category: "other",   dv: null, tier: "reach", labelTier: "macroBlock", mfColumn: "Sugars (g)" },
  { code: "sugar_added", label: "Added sugar",            unit: "g",   category: "other",   dv: 50,   tier: "limit", labelTier: "macroBlock", mfColumn: "Sugars Added (g)" },
  // — vitamins —
  { code: "vit_d",       label: "Vitamin D",              unit: "mcg", category: "vitamin", dv: 20,   tier: "reach", labelTier: "fdaRequired", mfColumn: "Vitamin D (mcg)" },
  { code: "vit_a",       label: "Vitamin A",              unit: "mcg", category: "vitamin", dv: 900,  tier: "reach", mfColumn: "Vitamin A (mcg)" },
  { code: "vit_c",       label: "Vitamin C",              unit: "mg",  category: "vitamin", dv: 90,   tier: "reach", mfColumn: "Vitamin C (mg)" },
  { code: "vit_e",       label: "Vitamin E",              unit: "mg",  category: "vitamin", dv: 15,   tier: "reach", mfColumn: "Vitamin E (mg)" },
  { code: "vit_k",       label: "Vitamin K",              unit: "mcg", category: "vitamin", dv: 120,  tier: "reach", mfColumn: "Vitamin K (mcg)" },
  { code: "thiamin",     label: "Thiamin (B1)",           unit: "mg",  category: "vitamin", dv: 1.2,  tier: "reach", mfColumn: "B1, Thiamine (mg)" },
  { code: "riboflavin",  label: "Riboflavin (B2)",        unit: "mg",  category: "vitamin", dv: 1.3,  tier: "reach", mfColumn: "B2, Riboflavin (mg)" },
  { code: "niacin",      label: "Niacin (B3)",            unit: "mg",  category: "vitamin", dv: 16,   tier: "reach", mfColumn: "B3, Niacin (mg)" },
  { code: "vit_b6",      label: "Vitamin B6",             unit: "mg",  category: "vitamin", dv: 1.7,  tier: "reach", mfColumn: "B6, Pyridoxine (mg)" },
  { code: "folate",      label: "Folate (B9)",            unit: "mcg", category: "vitamin", dv: 400,  tier: "reach", mfColumn: "Folate (mcg)" },
  { code: "vit_b12",     label: "Vitamin B12",            unit: "mcg", category: "vitamin", dv: 2.4,  tier: "reach", mfColumn: "B12, Cobalamin (mcg)" },
  { code: "biotin",      label: "Biotin",                 unit: "mcg", category: "vitamin", dv: 30,   tier: "reach" },
  { code: "pantothenic", label: "Pantothenic acid (B5)",  unit: "mg",  category: "vitamin", dv: 5,    tier: "reach", mfColumn: "B5, Pantothenic Acid (mg)" },
  { code: "choline",     label: "Choline",                unit: "mg",  category: "vitamin", dv: 550,  tier: "reach", mfColumn: "Choline (mg)" },
  // — minerals —
  { code: "sodium",      label: "Sodium",                 unit: "mg",  category: "mineral", dv: 2300, tier: "limit", labelTier: "macroBlock", mfColumn: "Sodium (mg)" },
  { code: "calcium",     label: "Calcium",                unit: "mg",  category: "mineral", dv: 1300, tier: "reach", labelTier: "fdaRequired", mfColumn: "Calcium (mg)" },
  { code: "iron",        label: "Iron",                   unit: "mg",  category: "mineral", dv: 18,   tier: "reach", labelTier: "fdaRequired", mfColumn: "Iron (mg)" },
  { code: "potassium",   label: "Potassium",              unit: "mg",  category: "mineral", dv: 4700, tier: "reach", labelTier: "fdaRequired", mfColumn: "Potassium (mg)" },
  { code: "magnesium",   label: "Magnesium",              unit: "mg",  category: "mineral", dv: 420,  tier: "reach", mfColumn: "Magnesium (mg)" },
  { code: "phosphorus",  label: "Phosphorus",             unit: "mg",  category: "mineral", dv: 1250, tier: "reach", mfColumn: "Phosphorus (mg)" },
  { code: "zinc",        label: "Zinc",                   unit: "mg",  category: "mineral", dv: 11,   tier: "reach", mfColumn: "Zinc (mg)" },
  { code: "copper",      label: "Copper",                 unit: "mg",  category: "mineral", dv: 0.9,  tier: "reach", mfColumn: "Copper (mg)" },
  { code: "manganese",   label: "Manganese",              unit: "mg",  category: "mineral", dv: 2.3,  tier: "reach", mfColumn: "Manganese (mg)" },
  { code: "selenium",    label: "Selenium",               unit: "mcg", category: "mineral", dv: 55,   tier: "reach", mfColumn: "Selenium (mcg)" },
  { code: "iodine",      label: "Iodine",                 unit: "mcg", category: "mineral", dv: 150,  tier: "reach" },
  { code: "chromium",    label: "Chromium",               unit: "mcg", category: "mineral", dv: 35,   tier: "reach" },
  { code: "molybdenum",  label: "Molybdenum",             unit: "mcg", category: "mineral", dv: 45,   tier: "reach" },
  { code: "chloride",    label: "Chloride",               unit: "mg",  category: "mineral", dv: 2300, tier: "reach" },
  // — supplements / off-label —
  { code: "caffeine",    label: "Caffeine",               unit: "mg",  category: "other",   dv: null, tier: "supplement", mfColumn: "Caffeine (mg)" },
  { code: "water",       label: "Water",                  unit: "ml",  category: "other",   dv: null, tier: "supplement" },
  { code: "creatine",    label: "Creatine",               unit: "g",   category: "other",   dv: null, tier: "supplement" },
];

export const NUTRIENT_BY_CODE: Record<NutrientCode, LedgerNutrient> = Object.fromEntries(
  NUTRIENTS.map((n) => [n.code, n])
) as Record<NutrientCode, LedgerNutrient>;

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 — SECTION SCHEMES (grouping + order; each scheme owns both)
// ─────────────────────────────────────────────────────────────────────────────
export type SectionHeading =
  | "Nutrition Facts" | "Macros"
  | "Fat Breakdown" | "Carb Breakdown" | "Protein Breakdown"
  | "Vitamins" | "Minerals" | "Other";

// A scheme section is an ordered list of items; each item is either a macro
// (column-backed) or a micronutrient (food_nutrients row). This is what lets the
// FDA scheme interleave "Total Fat" with its sub-nutrients, etc.
export type SectionItem = MacroKey | NutrientCode;

export interface NutrientSectionDef {
  heading: SectionHeading;
  color: string;
  items: SectionItem[];   // explicit sort order within the section
}

export interface SectionScheme {
  key: string;
  label: string;
  sections: NutrientSectionDef[];  // explicit section render order
}

// Per-heading accent (one source of truth — kills the duplicated SECTION_COLOR /
// FNB_SECTION_COLOR maps in NutritionClient.tsx and _diary.tsx).
export const SECTION_COLORS: Record<SectionHeading, string> = {
  "Nutrition Facts": "var(--fg-cal)",
  "Macros": "var(--fg-cal)",
  "Fat Breakdown": "var(--fg-fat)",
  "Carb Breakdown": "var(--fg-carb)",
  "Protein Breakdown": "var(--fg-protein)",
  "Vitamins": "color-mix(in srgb, var(--fg-cal) 45%, var(--fg-carb))",
  "Minerals": "color-mix(in srgb, var(--fg-fat) 60%, var(--alert-red-text))",
  "Other": "var(--color-gray)",
};

const section = (heading: SectionHeading, items: SectionItem[]): NutrientSectionDef => ({
  heading,
  color: SECTION_COLORS[heading],
  items,
});

// Accent for a section heading, tolerant of a plain string (renderers hold the
// heading as a string). Falls back to neutral gray for an unknown heading.
export const sectionColor = (heading: string): string =>
  SECTION_COLORS[heading as SectionHeading] ?? "var(--color-gray)";

// Scheme A — FDA Nutrition Facts label. Macros interleave with their sub-nutrients
// in true panel order (Calories → Total Fat → sat/trans → Cholesterol → Sodium →
// Total Carb → fiber/sugars → Protein → the four required micros). Off-label
// vitamins/minerals follow as their own groups; supplements last.
export const FDA_LABEL_SCHEME: SectionScheme = {
  key: "fda",
  label: "FDA Label",
  sections: [
    section("Nutrition Facts", [
      "kcal",
      "fat", "sat_fat", "trans_fat",
      "cholesterol", "sodium",
      "carbs", "fiber", "sugar_total", "sugar_added",
      "protein",
      "vit_d", "calcium", "iron", "potassium",
    ]),
    section("Vitamins", [
      "vit_a", "vit_c", "vit_e", "vit_k",
      "thiamin", "riboflavin", "niacin", "vit_b6", "folate", "vit_b12",
      "biotin", "pantothenic", "choline",
    ]),
    section("Minerals", [
      "magnesium", "phosphorus", "zinc", "copper", "manganese",
      "selenium", "iodine", "chromium", "molybdenum", "chloride",
    ]),
    section("Other", ["caffeine", "water", "creatine"]),
  ],
};

// Scheme B — Macro breakdown (MacroFactor-style). Macros lead in their own
// section; fat/carb/protein sub-nutrients split into breakdown sections; ALL
// vitamins and ALL minerals (incl. sodium / Ca / Fe / K) group by category;
// supplements last.
export const MACRO_BREAKDOWN_SCHEME: SectionScheme = {
  key: "macro",
  label: "Macro Breakdown",
  sections: [
    section("Macros", ["kcal", "protein", "fat", "carbs"]),
    section("Fat Breakdown", ["sat_fat", "trans_fat", "cholesterol"]),
    section("Carb Breakdown", ["fiber", "sugar_total", "sugar_added"]),
    section("Protein Breakdown", []),
    section("Vitamins", [
      "vit_d", "vit_a", "vit_c", "vit_e", "vit_k",
      "thiamin", "riboflavin", "niacin", "vit_b6", "folate", "vit_b12",
      "biotin", "pantothenic", "choline",
    ]),
    section("Minerals", [
      "sodium", "calcium", "iron", "potassium",
      "magnesium", "phosphorus", "zinc", "copper", "manganese",
      "selenium", "iodine", "chromium", "molybdenum", "chloride",
    ]),
    section("Other", ["caffeine", "water", "creatine"]),
  ],
};

export const SECTION_SCHEMES: Record<string, SectionScheme> = {
  [FDA_LABEL_SCHEME.key]: FDA_LABEL_SCHEME,
  [MACRO_BREAKDOWN_SCHEME.key]: MACRO_BREAKDOWN_SCHEME,
};

// ─────────────────────────────────────────────────────────────────────────────
// DERIVED VIEWS (computed; no new facts)
// ─────────────────────────────────────────────────────────────────────────────

// A scheme item resolved to its descriptor — discriminated on `kind` so a
// renderer knows whether to pull the value from the daily macro total (macro) or
// a food_nutrients row (micro). `accent` is the item's fill color: a macro's own
// hue, or null for a micro (use the section color).
export type ResolvedItem =
  | { kind: "macro"; key: MacroKey; macro: MacroDef; accent: string }
  | { kind: "micro"; code: NutrientCode; nutrient: LedgerNutrient; accent: null };

export interface ResolvedSection {
  heading: SectionHeading;
  color: string;
  items: ResolvedItem[];
}

const resolveItem = (item: SectionItem): ResolvedItem =>
  isMacroKey(item)
    ? { kind: "macro", key: item, macro: MACRO_BY_KEY[item], accent: MACRO_BY_KEY[item].color }
    : { kind: "micro", code: item, nutrient: NUTRIENT_BY_CODE[item], accent: null };

// Resolve a scheme's sections to descriptors, in the scheme's declared order.
// This is what UI section renderers consume.
export function resolveScheme(scheme: SectionScheme): ResolvedSection[] {
  return scheme.sections.map((s) => ({
    heading: s.heading,
    color: s.color,
    items: s.items.map(resolveItem),
  }));
}

// Flat item order per scheme (sections concatenated) — single ordered list.
export const flatItemOrder = (scheme: SectionScheme): SectionItem[] => scheme.sections.flatMap((s) => s.items);

// Canonical flat MICRO order (macros filtered out) for the order-agnostic
// nutrient-row consumers (LLM prompt list, import, etc.). Sourced from the FDA
// scheme so there's a defined answer; switch the scheme here to change it.
export const NUTRIENT_CODES_IN_ORDER: NutrientCode[] =
  flatItemOrder(FDA_LABEL_SCHEME).filter((i): i is NutrientCode => !isMacroKey(i));

// Rank of each micro in the canonical flat order. This is the SINGLE source of
// nutrient render order — the DB carries no ordering column. Unknown codes sort
// last.
const ORDER_INDEX_BY_CODE: Record<string, number> = Object.fromEntries(
  NUTRIENT_CODES_IN_ORDER.map((code, i) => [code, i])
);
export const nutrientOrderIndex = (code: string): number =>
  ORDER_INDEX_BY_CODE[code] ?? Number.MAX_SAFE_INTEGER;

// Comparator for arrays of objects carrying a nutrient `code`: ledger order, then
// name as a stable tiebreak.
export const byNutrientOrder = <T extends { code: string; name?: string }>(a: T, b: T): number =>
  (nutrientOrderIndex(a.code) - nutrientOrderIndex(b.code)) || (a.name ?? "").localeCompare(b.name ?? "");

// Essential subsets — derived from labelTier (kills the separate
// LABEL_ESSENTIAL_CODES / MACRO_BLOCK_CODES / implicit-FDA-4 lists). Ordered by
// the canonical flat order.
const inOrder = (pred: (n: LedgerNutrient) => boolean): NutrientCode[] =>
  NUTRIENT_CODES_IN_ORDER.filter((c) => pred(NUTRIENT_BY_CODE[c]));

export const MACRO_BLOCK_CODES: NutrientCode[] = inOrder((n) => n.labelTier === "macroBlock");
export const FDA_REQUIRED_CODES: NutrientCode[] = inOrder((n) => n.labelTier === "fdaRequired");
export const LABEL_ESSENTIAL_CODES: NutrientCode[] = inOrder((n) => !!n.labelTier);
export const LIMIT_CODES: NutrientCode[] = inOrder((n) => n.tier === "limit");

// FDA Daily Values keyed by code (replaces labelParser's DAILY_VALUES; null dropped).
export const DAILY_VALUES: Partial<Record<NutrientCode, number>> = Object.fromEntries(
  NUTRIENTS.filter((n) => n.dv != null).map((n) => [n.code, n.dv])
);

// MacroFactor import column → code (replaces importUtils' NUTRIENT_COLUMN_TO_CODE).
export const MF_COLUMN_TO_CODE: Record<string, NutrientCode> = Object.fromEntries(
  NUTRIENTS.filter((n) => n.mfColumn).map((n) => [n.mfColumn as string, n.code])
);

// Dev guard: every scheme must partition the full trackable set (all macros +
// all micros) — cover each item exactly once, no unknowns — or grouping silently
// drops/dupes an entry.
if (process.env.NODE_ENV !== "production") {
  const universe = new Set<SectionItem>([...MACROS.map((m) => m.key), ...NUTRIENTS.map((n) => n.code)]);
  for (const scheme of Object.values(SECTION_SCHEMES)) {
    const seen = new Map<SectionItem, number>();
    for (const s of scheme.sections) {
      for (const item of s.items) seen.set(item, (seen.get(item) ?? 0) + 1);
    }
    const dupes = [...seen].filter(([, n]) => n > 1).map(([c]) => c);
    const unknown = [...seen.keys()].filter((c) => !universe.has(c));
    const missing = [...universe].filter((c) => !seen.has(c));
    if (dupes.length || unknown.length || missing.length) {
      throw new Error(
        `nutrientLedger scheme "${scheme.key}" must partition macros+micros — ` +
        `dupes: [${dupes.join(", ")}]; unknown: [${unknown.join(", ")}]; missing: [${missing.join(", ")}]`
      );
    }
  }
}
