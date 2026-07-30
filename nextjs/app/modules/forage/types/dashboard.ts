// Per-user dashboard customization. A "card" is identified by a stable key that
// is either a synthetic macro key ('macros','kcal','protein','fat','carbs') or a
// nutrients.code micro ('sugar_total','sat_fat',…). Cards are stored per section
// in forage_dashboard_cards; no rows for a (user, section) pair means the user
// has never customized that section, so the built-in default set is used.

import { MACROS } from "../utils/nutrientLedger";

export type DashboardSection = "nutrition";

// The four synthetic macro cards are not rows in the `nutrients` table — they
// read the top-level daily totals + macro target instead. Everything else is
// keyed by a nutrient code. Sourced from the ledger's MACROS (single source).
export const MACRO_CARD_KEYS: string[] = MACROS.map((m) => m.key);

// Default Nutrition section layout for a user who has not customized it — the
// four macros plus sugars + sat fat.
export const DEFAULT_NUTRITION_CARDS: string[] = [
  "kcal",
  "protein",
  "fat",
  "carbs",
  "sugar_total",
  "sat_fat",
];

// Defaults keyed by section, so getNutritionCards-style fallbacks stay in one place.
export const DEFAULT_DASHBOARD_CARDS: Record<DashboardSection, string[]> = {
  nutrition: DEFAULT_NUTRITION_CARDS,
};
