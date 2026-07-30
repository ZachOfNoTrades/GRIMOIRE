export interface FoodEntry {
  id: string;
  user_id: string;
  entry_date: string;
  entry_time: string; // "HH:MM:SS"
  food_id: string | null;
  serving_id: string | null;
  quantity: number;
  quick_add_name: string | null;
  serving_unit: string | null;
  display_name: string;
  brand: string | null;
  // The backing food's source ('user' | 'usda' | 'recipe' | 'generic'), or null for
  // quick-add entries. Lets the timeline offer recipe-only actions (e.g. Explode).
  food_source: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  // Per-entry micronutrient amounts (already scaled by quantity/serving). Keyed by
  // nutrient code; only nutrients the food carries appear. Empty for quick-add entries.
  micros: Record<string, number>;
  ts_logged: string;
}

export interface DailyTotals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  // Sum of each entry's micros for the day, keyed by nutrient code.
  micros: Record<string, number>;
}
