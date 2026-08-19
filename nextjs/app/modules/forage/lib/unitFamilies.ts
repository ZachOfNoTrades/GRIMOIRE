// ============================================================
// Unit families — pure, dependency-free conversion math.
//
// Split out of unitConversion.ts (which pulls in child_process / FDC / AI and is
// therefore server-only) so the deterministic volume<->volume and mass<->mass
// helpers can be imported from client components too — e.g. the food editor and
// the log-time unit picker, which expand a food's logged units to every standard
// unit in the same family. unitConversion.ts re-exports these so existing
// server importers are unaffected.
// ============================================================

// Volume units, expressed in milliliters. "oz" is intentionally absent here — a
// bare ounce is treated as MASS (see MASS_G); fluid ounces use 'fl_oz'.
export const VOLUME_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  tsp: 4.92892,
  tbsp: 14.7868,
  fl_oz: 29.5735,
  cup: 236.588,
  pint: 473.176,
  quart: 946.353,
  gallon: 3785.41,
};

// Mass units, expressed in grams.
export const MASS_G: Record<string, number> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

// Normalize a free-text unit to our canonical key. The recipe LLM already emits
// units from a constrained set, but be liberal about plurals/synonyms so FDC
// portion labels and hand-typed units land on the same key.
const UNIT_ALIASES: Record<string, string> = {
  grams: 'g', gram: 'g', gms: 'g', gm: 'g',
  kilogram: 'kg', kilograms: 'kg', kgs: 'kg',
  milligram: 'mg', milligrams: 'mg',
  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', mls: 'ml', cc: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tbl: 'tbsp',
  cups: 'cup',
  ounce: 'oz', ounces: 'oz', ozs: 'oz',
  'fluid ounce': 'fl_oz', 'fluid ounces': 'fl_oz', 'fl oz': 'fl_oz', floz: 'fl_oz', 'fl-oz': 'fl_oz',
  pound: 'lb', pounds: 'lb', lbs: 'lb',
  pints: 'pint', pt: 'pint',
  quarts: 'quart', qt: 'quart',
  gallons: 'gallon', gal: 'gallon',
  slices: 'slice', pieces: 'piece', cloves: 'clove', cans: 'can', pinches: 'pinch',
  servings: 'serving', serv: 'serving',
};

export function normUnit(unit: string): string {
  const s = (unit ?? '').trim().toLowerCase();
  return UNIT_ALIASES[s] ?? s;
}

export type UnitFamily = 'VOLUME' | 'MASS' | 'COUNT';

export function familyOf(unit: string): UnitFamily {
  const u = normUnit(unit);
  if (u in VOLUME_ML) return 'VOLUME';
  if (u in MASS_G) return 'MASS';
  return 'COUNT';
}

// The unit's value in its family's base (ml for VOLUME, g for MASS); null for COUNT.
export function baseFactor(unit: string): number | null {
  const u = normUnit(unit);
  if (u in VOLUME_ML) return VOLUME_ML[u];
  if (u in MASS_G) return MASS_G[u];
  return null;
}

// Deterministic conversion within a single family. Returns null when the units
// are in different families (cross-family needs a density — not pure math) or
// either is a count unit.
export function convert(qty: number, from: string, to: string): number | null {
  const f = normUnit(from);
  const t = normUnit(to);
  if (f === t) return qty;
  if (familyOf(f) !== familyOf(t)) return null;
  const bf = baseFactor(f);
  const bt = baseFactor(t);
  if (bf == null || bt == null) return null;
  return (qty * bf) / bt;
}

// Standard units of each family, in a sensible display order. Used to expand a
// food's logged units to "all standard units of weight/volume" at log time.
export const STANDARD_MASS_UNITS = ['g', 'oz', 'lb', 'kg', 'mg'] as const;
export const STANDARD_VOLUME_UNITS = ['ml', 'fl_oz', 'cup', 'tbsp', 'tsp', 'l', 'pint', 'quart', 'gallon'] as const;

// Human-friendly label for a canonical unit key (most are identity). Used when
// materializing serving rows so they read "fl oz" / "L" rather than the
// underscore/lowercase keys. normUnit() maps these back, so conversion is
// unaffected.
const UNIT_DISPLAY_LABELS: Record<string, string> = {
  fl_oz: 'fl oz',
  l: 'L',
};
export function displayUnit(unit: string): string {
  return UNIT_DISPLAY_LABELS[unit] ?? unit;
}

// ============================================================
// UNIT TYPES — the display grouping used by every UOM dropdown.
//
// Same three buckets as UnitFamily, but lowercase and persisted: per-user custom
// units (forage_user_units.unit_type) store one of these so a made-up unit can be
// filed under Weight/Volume even though it can never convert. For any unit the
// caller has no stored type for, unitTypeOf() derives it from the family tables.
// ============================================================

export type UnitType = 'mass' | 'volume' | 'count';

export const UNIT_TYPES: UnitType[] = ['mass', 'volume', 'count'];

// Group headings, in the order dropdowns render them.
export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  mass: 'Weight',
  volume: 'Volume',
  count: 'Count & other',
};

// Derive a unit's type from the conversion tables. Anything we can't measure
// (slice, piece, serving, and every custom unit) falls through to 'count'.
export function unitTypeOf(unit: string): UnitType {
  const fam = familyOf(unit);
  return fam === 'MASS' ? 'mass' : fam === 'VOLUME' ? 'volume' : 'count';
}

// Split a list into <optgroup>-ready buckets, preserving each bucket's input
// order and dropping empty buckets. `typeOf` lets callers override the derived
// type (e.g. with a user's stored unit_type). Returns [] for an empty input.
export function groupByUnitType<T>(
  items: T[],
  typeOf: (item: T) => UnitType
): Array<{ type: UnitType; label: string; items: T[] }> {
  const buckets: Record<UnitType, T[]> = { mass: [], volume: [], count: [] };
  for (const item of items) buckets[typeOf(item)].push(item);
  return UNIT_TYPES.filter((t) => buckets[t].length > 0).map((t) => ({
    type: t,
    label: UNIT_TYPE_LABELS[t],
    items: buckets[t],
  }));
}
