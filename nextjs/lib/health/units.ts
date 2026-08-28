// Unit normalization for the master health store.
//
// Every sample is persisted in its metric's canonical_unit so that a value
// written by forage (pounds), by a Health Connect import (kilograms) and by a
// manual entry are all directly comparable. Conversion happens once, on write.

// Multiplier to reach the canonical unit, keyed canonical -> supplied unit.
const TO_CANONICAL: Record<string, Record<string, number>> = {
  kg: { kg: 1, g: 0.001, lb: 0.45359237, lbs: 0.45359237, oz: 0.028349523125 },
  cm: { cm: 1, m: 100, mm: 0.1, in: 2.54, inch: 2.54, inches: 2.54, ft: 30.48 },
  m: { m: 1, km: 1000, cm: 0.01, mi: 1609.344, mile: 1609.344, miles: 1609.344, yd: 0.9144, ft: 0.3048 },
  min: { min: 1, minutes: 1, s: 1 / 60, sec: 1 / 60, seconds: 1 / 60, h: 60, hr: 60, hours: 60, ms: 1 / 60000 },
  kcal: { kcal: 1, cal: 0.001, kj: 0.239005736, kJ: 0.239005736 },
  L: { L: 1, l: 1, ml: 0.001, mL: 0.001, floz: 0.0295735295625 },
  g: { g: 1, kg: 1000, mg: 0.001, oz: 28.349523125 },
};

// Units that carry no conversion family — accepted only as themselves.
const IDENTITY_UNITS = new Set(['%', 'bpm', 'mmHg', 'ms', 'rpm', 'degC', 'mmol/L', 'mL/kg/min', 'count']);

// Convert `value` from `unit` into `canonical`. A null/empty unit means the
// caller already supplied a canonical value. Throws on a unit this metric has
// no conversion for, so a bad write fails loudly instead of storing garbage.
export function toCanonical(value: number, unit: string | null | undefined, canonical: string): number {
  if (!unit || unit === canonical) return value;

  // degF is the one affine conversion — a multiplier table can't express it.
  if (canonical === 'degC' && (unit === 'degF' || unit === 'F')) {
    return (value - 32) * (5 / 9);
  }

  const family = TO_CANONICAL[canonical];
  const factor = family?.[unit];
  if (factor === undefined) {
    if (IDENTITY_UNITS.has(canonical)) {
      throw new Error(`Unit '${unit}' is not convertible to '${canonical}'`);
    }
    throw new Error(`No conversion from '${unit}' to '${canonical}'`);
  }
  return value * factor;
}

// Convert a canonical value out to a display unit. Inverse of toCanonical.
export function fromCanonical(value: number, canonical: string, unit: string | null | undefined): number {
  if (!unit || unit === canonical) return value;

  if (canonical === 'degC' && (unit === 'degF' || unit === 'F')) {
    return value * (9 / 5) + 32;
  }

  const factor = TO_CANONICAL[canonical]?.[unit];
  if (factor === undefined) throw new Error(`No conversion from '${canonical}' to '${unit}'`);
  return value / factor;
}

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}
