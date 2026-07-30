// Payload + result types for MacroFactor xlsx → Forage DB import.
// Mirrors golem's types/import.ts shape: a single ImportPayload is built client-side
// (or in the runner script) from the two xlsx workbooks, posted to /api/import,
// and turned into DB rows by lib/importFunctions.ts in one transaction.

export interface ImportFoodServing {
  unit: string;
  units_per_serving: number;
}

export interface ImportFoodNutrient {
  // Nutrient code from `nutrients.code` (e.g. 'sodium', 'fiber'). The lib resolves code→id.
  code: string;
  amount: number;
}

export interface ImportFood {
  name: string;
  brand: string | null;
  source: 'user' | 'recipe';
  kcal_per_serving: number;
  protein_g_per_serving: number;
  carbs_g_per_serving: number;
  fat_g_per_serving: number;
  servings: ImportFoodServing[];
  nutrients: ImportFoodNutrient[];
}

export interface ImportEntry {
  entry_date: string; // YYYY-MM-DD
  entry_time: string; // HH:MM:SS
  // food_name resolves to an ImportFood by name (case-insensitive). null = quick-add.
  food_name: string | null;
  unit: string | null;
  quantity: number;
  quick_add: {
    name: string;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  } | null;
}

export interface ImportWeight {
  log_date: string; // YYYY-MM-DD
  weight_lb: number;
  body_fat_pct: number | null;
}

export interface ImportDayNote {
  entry_date: string;
  note: string;
}

export interface ImportMacroTarget {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

// One program change in MacroFactor's Nutrition Program Settings sheet. Multiple
// rows let the dashboard look up the program that was active on a past date.
export interface ImportProgramHistoryEntry extends ImportMacroTarget {
  effective_date: string; // YYYY-MM-DD
}

export interface ImportGoal {
  goal_kind: 'lose' | 'maintain' | 'gain';
  target_weight_lb: number | null;
  rate_lb_per_week: number | null;
  // ISO timestamps; ended_at = null means In Progress.
  started_at: string;
  ended_at: string | null;
}

export interface ImportPayload {
  // Sanity check: must equal session user's email (verified server-side).
  user_email: string;
  foods: ImportFood[];
  entries: ImportEntry[];
  weights: ImportWeight[];
  day_notes: ImportDayNote[];
  // Full program-change history, chronological. The latest entry becomes is_active=1.
  program_history: ImportProgramHistoryEntry[];
  // Full goal history, chronological. The one with ended_at=null is the current goal.
  goals: ImportGoal[];
}

export interface ImportPreview {
  user_email: string;
  foods_count: number;
  recipes_count: number;
  entries_count: number;
  quick_add_entries_count: number;
  weights_count: number;
  day_notes_count: number;
  program_history_count: number;
  goals_count: number;
  date_range: { earliest: string; latest: string } | null;
  errors: string[];
}

export interface ImportWipeCounts {
  food_entries: number;
  foods: number;
  food_servings: number;
  food_nutrients: number;
  weight_log: number;
  day_notes: number;
  macro_targets: number;
  forage_program: number;
  forage_goal: number;
}

export interface ImportInsertCounts {
  foods: number;
  food_servings: number;
  food_nutrients: number;
  food_entries: number;
  weight_log: number;
  day_notes: number;
  macro_targets: number;
  forage_goal: number;
}

export interface ImportResult {
  wiped: ImportWipeCounts;
  inserted: ImportInsertCounts;
}
