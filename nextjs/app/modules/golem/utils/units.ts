// Distance units. Distance is always stored in METERS (the canonical base unit); these helpers convert
// to/from the user's chosen display unit. Exercises declare a distance modality ('short' | 'long') and the
// user picks a preferred unit for each band in their profile (short: feet/yards/meters, long: km/mi).

export type DistanceUnit = "meters" | "feet" | "yards" | "km" | "mi";
export type DistanceType = "short" | "long";

// Meters per one unit.
const METERS_PER_UNIT: Record<DistanceUnit, number> = {
  meters: 1,
  feet: 0.3048,
  yards: 0.9144,
  km: 1000,
  mi: 1609.344,
};

// Short abbreviation shown next to inputs and in history.
export const DISTANCE_UNIT_ABBREV: Record<DistanceUnit, string> = {
  meters: "m",
  feet: "ft",
  yards: "yd",
  km: "km",
  mi: "mi",
};

// The units offered for each distance band, in menu order.
export const SHORT_DISTANCE_UNITS: DistanceUnit[] = ["meters", "yards", "feet"];
export const LONG_DISTANCE_UNITS: DistanceUnit[] = ["km", "mi"];

export const DEFAULT_SHORT_UNIT: DistanceUnit = "meters";
export const DEFAULT_LONG_UNIT: DistanceUnit = "km";

// Resolve the display unit for an exercise's distance band from the user's preferences, falling back to the
// band default when the preference is unset (NULL in the DB) or invalid.
export function resolveDistanceUnit(
  distanceType: DistanceType,
  shortPref: string | null | undefined,
  longPref: string | null | undefined,
): DistanceUnit {
  if (distanceType === "long") {
    return LONG_DISTANCE_UNITS.includes(longPref as DistanceUnit) ? (longPref as DistanceUnit) : DEFAULT_LONG_UNIT;
  }
  return SHORT_DISTANCE_UNITS.includes(shortPref as DistanceUnit) ? (shortPref as DistanceUnit) : DEFAULT_SHORT_UNIT;
}

// Meters -> display unit, rounded to 3 decimals to avoid float noise in inputs (round values stay exact).
export function metersToUnit(meters: number | null | undefined, unit: DistanceUnit): number | null {
  if (meters == null) return null;
  return Math.round((meters / METERS_PER_UNIT[unit]) * 1000) / 1000;
}

// Display unit -> meters, rounded to 3 decimals (matches the DECIMAL(10,3) column scale).
export function unitToMeters(value: number | null | undefined, unit: DistanceUnit): number | null {
  if (value == null) return null;
  return Math.round(value * METERS_PER_UNIT[unit] * 1000) / 1000;
}
