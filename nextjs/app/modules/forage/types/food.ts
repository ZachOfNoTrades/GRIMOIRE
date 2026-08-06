export type FoodSource = 'user' | 'usda' | 'recipe' | 'generic';

export interface FoodServing {
  id: string;
  food_id: string;
  unit: string;
  // How many of <unit> equal one canonical serving of this food.
  // e.g. white rice 'g' row = 158 (158 g per serving); 'cup' row = 1 (1 cup per serving).
  units_per_serving: number;
}

export type NutrientCategory = 'macro' | 'vitamin' | 'mineral' | 'other';

export interface Nutrient {
  id: string;
  code: string;
  name: string;
  category: NutrientCategory;
  unit: string;
  daily_value: number | null;
  // FDA-derived DEFAULT target band (each optional). Reach nutrients carry a
  // floor (=DV), limit nutrients a ceiling (=DV), supplements carry none.
  // Per-program overrides live in nutrient_targets; these are the fallback.
  default_floor: number | null;
  default_target: number | null;
  default_ceiling: number | null;
}

// A nutrient's effective target band for a given user — the active program's
// manual nutrient_targets row if present, else the FDA defaults. floor/target/
// ceiling are each optional (null = no marker). `source` says which won.
export interface ResolvedNutrientTarget {
  nutrient_id: string;
  code: string;
  floor: number | null;
  target: number | null;
  ceiling: number | null;
  source: 'default' | 'manual';
}

export interface FoodNutrient {
  nutrient_id: string;
  amount: number;
}

// One row of the "foods highest in <nutrient>" list on the nutrient detail page.
// `amount` is the stored food_nutrients amount in the food's OWN backing reference;
// `basis` says which reference that is (serving vs per-100 g/ml) so the UI can label
// each row honestly without a forced common denominator. `total_consumed` is the
// SUM of this nutrient actually eaten from the food across the selected log-date
// window (from food_entry_nutrients) — the "highest total" sort key, in the
// nutrient's own unit; it powers the per-serving vs total toggle on the detail page.
export interface FoodNutrientRanking {
  food_id: string;
  name: string;
  brand: string | null;
  icon: string | null;
  amount: number;
  basis: "serving" | "100g" | "100ml";
  total_consumed: number;
}

// One logged day's intake of a single nutrient — a point in the per-nutrient
// detail page's daily-intake trend chart. `date` is YYYY-MM-DD.
export interface NutrientDailyPoint {
  date: string;
  value: number;
}

// One trailing-week bucket in a food's logging-frequency chart. `week_start` is
// the YYYY-MM-DD of the first day in the 7-day window; `count` is how many diary
// entries logged this food during that window.
export interface FoodUsageWeek {
  week_start: string;
  count: number;
}

// How often a food has been logged. Drives the "Usage" card on the food detail
// page: all-time headline stats plus a trailing weekly-frequency bar chart.
export interface FoodUsageStats {
  // All-time count of diary entries that logged this food.
  total_entries: number;
  // Distinct calendar days this food was logged on (all-time).
  distinct_days: number;
  // First / most-recent day this food was logged (YYYY-MM-DD), null if never.
  first_logged: string | null;
  last_logged: string | null;
  // Trailing weekly buckets (oldest → newest) for the frequency chart.
  weekly: FoodUsageWeek[];
}

export interface Food {
  id: string;
  user_id: string | null;
  name: string;
  brand: string | null;
  source: FoodSource;
  usda_fdc_id: number | null;
  barcode_upc: string | null;
  // Public product/nutrition page this food's data came from — typed into the
  // create/edit form or stamped by the "Import from website" flow. Drives the
  // food detail page's Resync action. null when the food has no web source.
  source_url: string | null;
  kcal_per_serving: number;
  protein_g_per_serving: number;
  carbs_g_per_serving: number;
  fat_g_per_serving: number;
  is_favorite: boolean;
  is_archived: boolean;
  // Preseeded icon code (see lib/foodIcons.tsx FOOD_ICONS). null → default apple.
  icon: string | null;
  // ISO timestamp of the food's stored photo, or null when it has none. Drives
  // whether the avatar renders the photo or falls back to the icon, and busts
  // the image URL's cache when the photo is replaced.
  image_updated_at: string | null;
  servings: FoodServing[];
  // Populated by getFood; omitted by listFoods to keep the library list cheap.
  nutrients?: FoodNutrient[];
  // Set ONLY on "Latest"/recent picker rows: the serving + amount from the user's
  // most recent log of this food, so the row defaults to "last used" instead of a
  // generic "1 serving". serving_id references a real food_servings row (never the
  // implicit canonical serving), so per-100g/ml foods like water stay on their base
  // unit. Absent on library rows.
  last_serving_id?: string | null;
  last_quantity?: number;
}
