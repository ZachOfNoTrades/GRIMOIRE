import {
  STANDARD_MASS_UNITS,
  STANDARD_VOLUME_UNITS,
  baseFactor,
  convert,
  displayUnit,
  familyOf,
  normUnit,
} from './unitFamilies';

// A ServingRow says how many of a unit make one serving of a food.
export interface ServingRow {
  unit: string;
  units_per_serving: number;
}

// A ServingRowConflict is a pair of rows that cannot describe the same serving.
export interface ServingRowConflict {
  firstRow: ServingRow;
  secondRow: ServingRow;
}

// Largest ratio between two weights or two volumes that still counts as one serving
// NOTE: A label rounds when it prints one serving in two units, as in "2 oz (56g)"
const MAX_SAME_SERVING_RATIO = 1.1;

// Determine if two rows cannot describe the same serving
// 1. Reject a repeated unit, whatever the amounts
// 2. Allow two different count units, and a weight beside a volume, as neither converts
// 3. Reject a weight or volume pair whose amounts convert to different servings
function rowsConflict(firstRow: ServingRow, secondRow: ServingRow): boolean {
  if (normUnit(firstRow.unit) === normUnit(secondRow.unit)) return true;
  if (familyOf(firstRow.unit) !== familyOf(secondRow.unit)) return false;
  const firstFactor = baseFactor(firstRow.unit);
  const secondFactor = baseFactor(secondRow.unit);
  if (firstFactor === null || secondFactor === null) return false;
  const firstAmount = firstRow.units_per_serving * firstFactor;
  const secondAmount = secondRow.units_per_serving * secondFactor;
  if (!(firstAmount > 0 && secondAmount > 0)) return false; // A blank amount has nothing to compare
  return Math.max(firstAmount, secondAmount) / Math.min(firstAmount, secondAmount) > MAX_SAME_SERVING_RATIO;
}

// Find the first pair of rows that cannot describe the same serving
export function findServingRowConflict(rows: ServingRow[]): ServingRowConflict | null {
  for (let second = 1; second < rows.length; second++) {
    for (let first = 0; first < second; first++) {
      if (rowsConflict(rows[first], rows[second])) {
        return { firstRow: rows[first], secondRow: rows[second] };
      }
    }
  }
  return null;
}

// Word a conflict for the person or client who sent the rows
export function servingRowConflictMessage({ firstRow, secondRow }: ServingRowConflict): string {
  if (normUnit(firstRow.unit) === normUnit(secondRow.unit)) {
    return `Only one row can use ${firstRow.unit}. Remove the other.`;
  }
  return `${firstRow.units_per_serving} ${firstRow.unit} and ${secondRow.units_per_serving} ${secondRow.unit} are different amounts. Change one or remove it.`;
}

// Add each candidate row that does not conflict with the rows already kept
export function mergeServingRows<Row extends ServingRow>(keptRows: Row[], candidateRows: Row[]): Row[] {
  const mergedRows = [...keptRows];
  for (const candidateRow of candidateRows) {
    if (!mergedRows.some((row) => rowsConflict(row, candidateRow))) mergedRows.push(candidateRow);
  }
  return mergedRows;
}

// Build the rows of a food estimated as a household unit that weighs a number of grams
// NOTE: An estimate of "1 oz, 85 g" means one serving is 85 g, so a weight unit converts from the grams
export function servingRowsFromGrams(unit: string, grams: number): ServingRow[] {
  const gramsRow = { unit: 'g', units_per_serving: grams };
  if (normUnit(unit) === 'g') return [gramsRow];
  const convertedAmount = convert(grams, 'g', unit);
  return [{ unit, units_per_serving: convertedAmount ?? 1 }, gramsRow];
}

// Pick the first standard unit no row uses yet
export function nextServingUnit(usedUnits: string[]): string {
  const usedKeys = new Set(usedUnits.map(normUnit));
  const unusedUnit = [...STANDARD_MASS_UNITS, ...STANDARD_VOLUME_UNITS].find((unit) => !usedKeys.has(normUnit(unit)));
  return unusedUnit ? displayUnit(unusedUnit) : 'serving';
}
