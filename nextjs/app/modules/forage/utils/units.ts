// Unit catalog for food servings.
// `gramsPerUnit` is the canonical mass equivalent for one unit. For density-dependent
// units (ml/cup/tsp/tbsp) the default assumes water (~1 g/ml); the user can override
// the gram value at save time when the food's density differs.

export interface UnitDef {
  key: string;
  label: string;
  gramsPerUnit: number | null; // null = no fixed conversion (e.g. "serving", "slice", "piece")
  density_dependent?: boolean;
}

export const UNITS: UnitDef[] = [
  { key: 'g', label: 'g', gramsPerUnit: 1 },
  { key: 'kg', label: 'kg', gramsPerUnit: 1000 },
  { key: 'oz', label: 'oz', gramsPerUnit: 28.3495 },
  { key: 'lb', label: 'lb', gramsPerUnit: 453.592 },
  { key: 'ml', label: 'ml', gramsPerUnit: 1, density_dependent: true },
  { key: 'l', label: 'l', gramsPerUnit: 1000, density_dependent: true },
  { key: 'tsp', label: 'tsp', gramsPerUnit: 4.92892, density_dependent: true },
  { key: 'tbsp', label: 'tbsp', gramsPerUnit: 14.7868, density_dependent: true },
  { key: 'cup', label: 'cup', gramsPerUnit: 240, density_dependent: true },
];

export function unitDef(key: string): UnitDef | undefined {
  return UNITS.find((u) => u.key === key);
}

export function defaultGramsFor(unit: string, amount: number): number | null {
  const d = unitDef(unit);
  if (!d || d.gramsPerUnit == null) return null;
  return d.gramsPerUnit * amount;
}

export function formatServingDisplay(name: string, unit: string, amount: number, grams: number): string {
  if (unit === 'g') return `${name} (${grams}g)`;
  return `${name} — ${amount} ${unit} (${grams}g)`;
}

// =============================
// Body weight conversion — DB stores lbs (canonical); UI may display kg per setting.
// =============================
export const LB_PER_KG = 2.2046226218;
export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const kgToLb = (kg: number) => kg * LB_PER_KG;

export type WeightUnit = 'lbs' | 'kg';

/** Convert a stored lb value into the user's preferred display unit. */
export function lbInUnit(lb: number, unit: WeightUnit): number {
  return unit === 'lbs' ? lb : lbToKg(lb);
}

/** Convert a UI-entered value (in `unit`) back to lbs for storage. */
export function toLb(value: number, unit: WeightUnit): number {
  return unit === 'lbs' ? value : kgToLb(value);
}

export function unitLabel(unit: WeightUnit): string {
  return unit === 'lbs' ? 'lbs' : 'kg';
}
