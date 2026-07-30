export type EquipmentCategory =
  | "small_weights"
  | "bars_and_plates"
  | "benches_and_racks"
  | "cable_machines"
  | "strength_machines"
  | "resistance_bands"
  | "cardio_machines"
  | "bodyweight"
  | "other";

export interface Equipment {
  id: string;
  name: string;
  category: EquipmentCategory;
  has_image: boolean; // fetch the actual photo from /modules/golem/api/equipment/[id]/image
  has_options: boolean;
  sort_order: number;
}

export interface EquipmentOption {
  id: string;
  equipment_id: string;
  label: string;
  value_kg: number | null;
  sort_order: number;
}

export interface Location {
  id: string;
  name: string;
  is_active: boolean;
  is_warmup_active: boolean;
  is_default: boolean;
  bodyweight_only: boolean;
  sort_order: number;
}

export interface LocationEquipmentSelection {
  equipment_id: string;
  option_ids: string[];
}

export interface LocationWithEquipment extends Location {
  selections: LocationEquipmentSelection[];
}

export interface ActiveLocationEquipmentItem {
  equipment: Equipment;
  options: EquipmentOption[];
}

export interface ActiveLocationEquipment {
  location: Location;
  items: ActiveLocationEquipmentItem[];
}
