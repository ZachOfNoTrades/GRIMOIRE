import type { UnitType } from '../lib/unitFamilies';

export type { UnitType };

// One selectable unit of measure, as handed to the UOM dropdowns. Built-ins come
// from the shared `food_units` catalog (`is_custom: false`, `type` derived from the
// conversion tables); custom rows come from the caller's own `forage_user_units`
// (`is_custom: true`, `type` chosen by the user, display-grouping only).
export interface FoodUnit {
  id: string;
  name: string;
  type: UnitType;
  display_order: number;
  is_custom: boolean;
}

// Custom unit names are free text, but bounded — the column is NVARCHAR(32) and a
// dropdown option has to stay readable next to "1 serving =".
export const CUSTOM_UNIT_MAX_LEN = 32;

// Where a user's custom units sort relative to the built-ins (last built-in is 120).
export const CUSTOM_UNIT_ORDER_BASE = 1000;
