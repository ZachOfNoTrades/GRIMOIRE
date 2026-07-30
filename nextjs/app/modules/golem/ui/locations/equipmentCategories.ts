import {
  Activity,
  Cable,
  Disc,
  Dumbbell,
  Package,
  PersonStanding,
  Settings2,
  StretchHorizontal,
  Waves,
  type LucideIcon,
} from "lucide-react";
import type { EquipmentCategory } from "../../types/location";

// Record<EquipmentCategory, ...> (not a plain object) so adding a category to the type
// forces a label + icon here too — a new equipment category silently missing from the
// picker (as strength_machines was) can't happen again without a compile error.

export const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  small_weights: "Small weights",
  bars_and_plates: "Bars & plates",
  benches_and_racks: "Benches & racks",
  cable_machines: "Cable machines",
  strength_machines: "Strength machines",
  resistance_bands: "Resistance bands",
  cardio_machines: "Cardio machines",
  bodyweight: "Bodyweight",
  other: "Other",
};

export const CATEGORY_ICONS: Record<EquipmentCategory, LucideIcon> = {
  small_weights: Dumbbell,
  bars_and_plates: Disc,
  benches_and_racks: StretchHorizontal,
  cable_machines: Cable,
  strength_machines: Settings2,
  resistance_bands: Waves,
  cardio_machines: Activity,
  bodyweight: PersonStanding,
  other: Package,
};

export const CATEGORY_ORDER: EquipmentCategory[] = [
  "small_weights",
  "bars_and_plates",
  "benches_and_racks",
  "cable_machines",
  "strength_machines",
  "resistance_bands",
  "cardio_machines",
  "bodyweight",
  "other",
];
