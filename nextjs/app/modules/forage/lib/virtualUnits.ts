import { Food, FoodContainer, FoodServing } from "../types/food";
import {
  convert,
  normUnit,
  familyOf,
  baseFactor,
  MASS_G,
  VOLUME_ML,
  STANDARD_MASS_UNITS,
  STANDARD_VOLUME_UNITS,
  displayUnit,
} from "./unitFamilies";

// VIRTUAL UNITS — a food whose servings include a real mass- or volume-family row
// (e.g. a per-100 g food's `g` row, or a per-100 ml food's `ml` row) can be picked
// in ANY standard unit of that family without those units being stored on the food.
// We synthesize the extra units as in-memory serving rows (id `virtual:<baseId>:<unit>`)
// so the existing picker/scaling/unit-switch logic works unchanged; at save time
// resolveServingForSave converts a virtual selection back to the base unit and stores
// that (e.g. pick "8 fl oz" → store 236.6 ml against the real `ml` row).
//
// Shared by the diary logging flow (_diary.tsx) and the recipe builder so a generic
// food the AI resolved on a 100 g basis (its base unit is grams, not a "serving")
// can still be measured in lb/oz/kg — the units the photo or recipe actually showed.
export const VIRTUAL_PREFIX = "virtual:";

// CONTAINER UNITS — a food's containers are offered as more units, with ids `container:<containerId>`;
// resolveServingForSave stores a container pick as the same number of servings on a real row
export const CONTAINER_PREFIX = "container:";

// Make a food's containers into in-memory serving rows, after its real and virtual units
function containerServings(foodId: string, containers: FoodContainer[]): FoodServing[] {
  return containers
    .filter((c) => Number(c.servings_per_container) > 0)
    .map((c) => ({
      id: `${CONTAINER_PREFIX}${c.id}`,
      food_id: foodId,
      unit: c.name,
      units_per_serving: 1 / Number(c.servings_per_container),
    }));
}

// Expand a food's real serving rows with its standard units and its containers
export function expandVirtualServings(foodId: string, real: FoodServing[], containers: FoodContainer[] = []): FoodServing[] {
  const withUnits = expandStandardUnits(foodId, real);
  const asServings = containerServings(foodId, containers);
  return asServings.length === 0 ? withUnits : [...withUnits, ...asServings];
}

// Expand a food's real serving rows with the standard units of the base row's
// family. Returns the input array unchanged when the food has no convertible
// mass/volume anchor (count-based foods) or already carries every standard unit.
function expandStandardUnits(foodId: string, real: FoodServing[]): FoodServing[] {
  // Anchor EACH family independently. A food carrying both a mass row and a volume
  // row (a quick-added food saved as "28 g / 0.25 cup") describes one serving two
  // ways, so both expansions are valid and the user gets weights AND volumes.
  // Anchoring on a single preferred family instead meant such a food offered its
  // extrapolated volumes but no extrapolated weights at all.
  const anchors = (["VOLUME", "MASS"] as const)
    .map((fam) => real.find((s) => familyOf(s.unit) === fam && Number(s.units_per_serving) > 0))
    .filter((s): s is FoodServing => !!s);
  if (anchors.length === 0) return real; // count-based food → no standard-unit expansion

  // Units already stored on the food, across every family — never shadow a real row.
  const existing = new Set(real.map((s) => normUnit(s.unit)));
  const virtuals: FoodServing[] = [];

  for (const baseRow of anchors) {
    const fam = familyOf(baseRow.unit);
    const order = fam === "MASS" ? STANDARD_MASS_UNITS : STANDARD_VOLUME_UNITS;
    const base = fam === "MASS" ? MASS_G : VOLUME_ML;
    // Base-family amount in one serving, e.g. ml-per-serving = ups(ml) × ml-per-ml.
    const perServingBase = Number(baseRow.units_per_serving) * (baseFactor(baseRow.unit) ?? 1);
    for (const u of order) {
      if (existing.has(u)) continue;
      existing.add(u); // guard against two anchors both claiming a unit
      virtuals.push({
        id: `${VIRTUAL_PREFIX}${baseRow.id}:${u}`,
        food_id: foodId,
        unit: displayUnit(u),
        units_per_serving: Math.round((perServingBase / base[u]) * 1e4) / 1e4,
      });
    }
  }

  return virtuals.length === 0 ? real : [...real, ...virtuals];
}

// Food-level wrapper: expand the food's servings in place.
export function withVirtualUnits(food: Food): Food {
  const real = food.servings ?? [];
  const expanded = expandVirtualServings(food.id, real, food.containers ?? []);
  if (expanded.length === real.length) return food;
  return { ...food, servings: expanded };
}

// Resolve a (servingId, quantity) selection for persistence. A virtual selection
// is converted to its base unit so the stored row references a real serving.
// Non-virtual selections pass through unchanged.
export function resolveServingForSave(
  servings: FoodServing[],
  servingId: string | null,
  quantity: number
): { serving_id: string | null; quantity: number } {
  if (servingId?.startsWith(CONTAINER_PREFIX)) return resolveContainerForSave(servings, servingId, quantity);
  if (!servingId || !servingId.startsWith(VIRTUAL_PREFIX)) {
    return { serving_id: servingId, quantity };
  }
  // id shape: virtual:<baseServingId>:<canonicalUnit>
  const rest = servingId.slice(VIRTUAL_PREFIX.length);
  const idx = rest.lastIndexOf(":");
  const baseId = rest.slice(0, idx);
  const canonUnit = rest.slice(idx + 1);
  const baseRow = servings.find((s) => s.id === baseId);
  if (baseRow && Number.isFinite(quantity)) {
    const converted = convert(quantity, canonUnit, normUnit(baseRow.unit));
    if (converted != null) return { serving_id: baseId, quantity: Math.round(converted * 1e4) / 1e4 };
  }
  return { serving_id: baseId || null, quantity };
}

// Store an amount of containers as the same number of servings on the food's serving row, or on its first real row when it has none
function resolveContainerForSave(
  servings: FoodServing[],
  servingId: string,
  quantity: number
): { serving_id: string | null; quantity: number } {
  const containerRow = servings.find((s) => s.id === servingId);
  const realRows = servings.filter((s) => !s.id.startsWith(CONTAINER_PREFIX) && !s.id.startsWith(VIRTUAL_PREFIX));
  const baseRow = realRows.find((s) => normUnit(s.unit) === "serving") ?? realRows[0];
  if (!containerRow || !baseRow || !Number.isFinite(quantity)) return { serving_id: baseRow?.id ?? null, quantity };
  const servingCount = quantity / Number(containerRow.units_per_serving);
  return { serving_id: baseRow.id, quantity: Math.round(servingCount * Number(baseRow.units_per_serving) * 1e4) / 1e4 };
}
