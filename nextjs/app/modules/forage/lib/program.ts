import {
  DietKind,
  DistributionKind,
  FloorKind,
  ProteinBand,
  TrainingKind,
} from '../types/program';
import { GoalKind } from '../types/goal';

// Internal canonical for the physiology constants below is metric. The public
// interface speaks pounds — the values are converted to kg at the entry to keep
// the math (kcal/kg maintenance, kcal/kg fat, g/kg protein) untouched.
export const LB_PER_KG = 2.2046226218;
export const lbToKg = (lb: number) => lb / LB_PER_KG;

// Energy density of body-mass change — one kg of (mostly fat) tissue ≈ 7,700
// kcal (≈ the classic 3,500 kcal/lb). Shared by the goal-delta math here and the
// adaptive expenditure estimator (energy balance from weight trend).
export const KCAL_PER_KG_MASS = 7700;

export interface ComputeInput {
  goal_kind: GoalKind;
  rate_lb_per_week: number | null;
  protein_band: ProteinBand;
  diet_kind: DietKind;
  training_kind: TrainingKind;
  floor_kind: FloorKind;
  distribution_kind: DistributionKind;
  shifted_high_days: number[] | null;
  latest_weight_lb: number | null;
  // Data-derived maintenance/TDEE (kcal/day). When supplied and positive it is
  // used as the maintenance baseline instead of the coarse bodyweight formula —
  // this is how the adaptive expenditure estimate (logged intake + weight trend)
  // feeds the target math. Omit / null to fall back to naiveMaintenanceKcal.
  maintenance_kcal_override?: number | null;
  // The calorie target currently in force, when there is one. Supplying it turns
  // on the per-check-in rate limit (see maxCheckInKcalChange) so one recompute
  // can't yank the budget across the room. Only the check-in path passes it —
  // deliberate resets (new goal, new program, the wizard previews) leave it unset
  // and get the raw number, because there the jump IS the thing being chosen.
  previous_kcal?: number | null;
}

export interface ComputeOutput {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  per_weekday?: Array<{ weekday: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number }>;
}

const PROTEIN_BAND_G_PER_KG: Record<ProteinBand, number> = {
  low: 1.4,
  moderate: 1.8,
  high: 2.2,
  extra_high: 2.6,
};

// Of remaining kcal after protein: [carb_pct, fat_pct]
const DIET_SPLIT: Record<DietKind, [number, number]> = {
  balanced: [0.5, 0.5],
  low_fat: [0.7, 0.3],
  low_carb: [0.3, 0.7],
  keto: [0.1, 0.9],
};

// Light multiplier on naive 30 kcal/kg maintenance
export const TRAINING_MULT: Record<TrainingKind, number> = {
  none: 1.0,
  lifting: 1.08,
  cardio: 1.12,
  cardio_lifting: 1.18,
};

export const FLOOR_MIN_KCAL: Record<FloorKind, number> = {
  standard: 1500,
  low: 1050,
};

// The coarse fallback maintenance estimate: 30 kcal/kg bodyweight with a light
// training multiplier. Used only when no data-derived expenditure is available
// (e.g. a brand-new user with no logged intake / weigh-in history). Exposed so
// the expenditure estimator and the preview endpoints share one definition
// rather than re-deriving 30-kcal/kg in three places.
export function naiveMaintenanceKcal(weightKg: number, trainingKind: TrainingKind): number {
  return weightKg * 30 * TRAINING_MULT[trainingKind];
}

// How far a single weekly check-in may move the calorie target: 15% of the
// standing target, but never less than a flat 150 kcal so small budgets can
// still move meaningfully.
//
// Without this, one recompute can hand the user a several-hundred-kcal cliff.
// Two things drive that, and the cap covers both. The loud one is the
// expenditure estimator SWITCHING METHODS between check-ins: it needs 10
// complete logged days and a 14-day weigh-in span inside the intake/weigh-in
// overlap, and until it has them it falls back to the coarse 30 kcal/kg
// formula. The week those gates finally pass, maintenance jumps from a
// bodyweight guess to a measured number in one step — observed 2026-08-07 as
// 3,211 -> 2,432, i.e. a 775 kcal target drop overnight with nothing about the
// user having actually changed. The quiet one is ordinary noise in the adaptive
// estimate itself, where a couple of stray scale readings can shift the fitted
// trend enough to move maintenance by a few hundred.
//
// Clamping doesn't lose the new information — each check-in re-clamps from the
// updated target, so the budget still walks to wherever the estimator says
// within a few weeks. It just refuses to get there in one jump.
export const MAX_CHECKIN_KCAL_CHANGE_PCT = 0.15;
export const MIN_CHECKIN_KCAL_CHANGE = 150;

export function maxCheckInKcalChange(previousKcal: number): number {
  return Math.max(MIN_CHECKIN_KCAL_CHANGE, Math.round(previousKcal * MAX_CHECKIN_KCAL_CHANGE_PCT));
}

export function computeTargets(input: ComputeInput): ComputeOutput {
  // Convert public lb interface to internal kg before applying physiology constants.
  const weightKg = input.latest_weight_lb != null ? lbToKg(input.latest_weight_lb) : 70;
  const rateKg = input.rate_lb_per_week != null ? lbToKg(input.rate_lb_per_week) : 0;

  // Maintenance / TDEE. Prefer a data-derived estimate (adaptive expenditure
  // from logged intake + weight trend) when the caller supplies one; otherwise
  // fall back to the coarse 30 kcal/kg × training-multiplier formula.
  const maintenance =
    input.maintenance_kcal_override != null && input.maintenance_kcal_override > 0
      ? input.maintenance_kcal_override
      : naiveMaintenanceKcal(weightKg, input.training_kind);

  // Apply goal delta (7,700 kcal/kg fat tissue)
  const dailyDelta =
    input.goal_kind === 'maintain' ? 0 : (rateKg * KCAL_PER_KG_MASS) / 7 * (input.goal_kind === 'lose' ? -1 : 1);

  // Apply floor
  const floor = FLOOR_MIN_KCAL[input.floor_kind];
  let kcal = Math.max(floor, maintenance + dailyDelta);

  // Rate-limit the move away from the standing target, when the caller supplied
  // one. The floor is re-applied afterwards so the cap can never hold the budget
  // below it — clamping toward a previous target must not undo a safety limit.
  if (input.previous_kcal != null && input.previous_kcal > 0) {
    const maxStep = maxCheckInKcalChange(input.previous_kcal);
    const lowerBound = input.previous_kcal - maxStep;
    const upperBound = input.previous_kcal + maxStep;
    kcal = Math.max(floor, Math.min(upperBound, Math.max(lowerBound, kcal)));
  }

  // Protein from bodyweight
  const protein_g = Math.round(weightKg * PROTEIN_BAND_G_PER_KG[input.protein_band]);
  const protein_kcal = protein_g * 4;

  // Split remainder
  const remaining = Math.max(0, kcal - protein_kcal);
  const [carbPct, fatPct] = DIET_SPLIT[input.diet_kind];
  const carbs_g = Math.round((remaining * carbPct) / 4);
  const fat_g = Math.round((remaining * fatPct) / 9);

  // Recompute kcal from actual macro grams so they add up
  kcal = Math.round(protein_kcal + carbs_g * 4 + fat_g * 9);

  let per_weekday: ComputeOutput['per_weekday'];
  if (input.distribution_kind === 'shifted' && input.shifted_high_days && input.shifted_high_days.length > 0 && input.shifted_high_days.length < 7) {
    const highCount = input.shifted_high_days.length;
    const lowCount = 7 - highCount;
    const highMult = 1.15;
    const lowMult = (7 - highCount * highMult) / lowCount;
    per_weekday = [];
    for (let wd = 1; wd <= 7; wd++) {
      const mult = input.shifted_high_days.includes(wd) ? highMult : lowMult;
      const dayKcal = Math.round(kcal * mult);
      const dayCarbs = Math.round(carbs_g * mult);
      const dayFat = Math.round(fat_g * mult);
      per_weekday.push({
        weekday: wd,
        kcal: dayKcal,
        protein_g, // protein stays constant
        carbs_g: dayCarbs,
        fat_g: dayFat,
      });
    }
  }

  return { kcal, protein_g, carbs_g, fat_g, per_weekday };
}

// Canonical UTC "today" for all check-in math (last_checkin_date, isCheckInDue,
// the check-in wizard) — shared so programFunctions/checkinFunctions/the
// scheduler don't each keep their own copy.
export function todayIsoUtc(): string {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`;
}

// Server-local "today" — matches how weight_log/food_entries dates are
// actually entered and compared everywhere else in the app (the weigh-in
// modal's date field, the food diary, etc. all default to local calendar
// date, never UTC). Used for the check-in wizard's weigh-in-stats and
// partial-log-day detection, which compare against those local-dated rows —
// using todayIsoUtc() there would misfire for part of every day (e.g. a
// UTC-5 server has ~5 hours nightly where UTC has already rolled to
// tomorrow while it's still "today" locally), making a same-day weigh-in
// look like it wasn't logged today. isCheckInDue/last_checkin_date stay on
// the UTC clock — that's a separate, intentional choice for weekday math.
export function todayIsoLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// The most recent occurrence of the check-in weekday on or before `todayIso`
// (returns today itself when today IS the check-in weekday). yyyy-mm-dd, UTC.
export function lastCheckInOccurrence(checkInWeekday: number, todayIso: string): string {
  const [y, m, d] = todayIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const isoWeekday = ((dt.getUTCDay() + 6) % 7) + 1; // 1=Mon..7=Sun
  const daysBack = (isoWeekday - checkInWeekday + 7) % 7; // 0 when today is the check-in day
  dt.setUTCDate(dt.getUTCDate() - daysBack);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// Whether a coached program's weekly check-in is currently due. True on the
// check-in weekday AND on every day after it until the check-in is actually
// completed, so a missed (late) check-in keeps prompting instead of being
// silently skipped until the following week. Compares the most recent check-in
// occurrence (on/before today) against the last completed check-in date: due
// whenever that occurrence hasn't been checked in yet (string comparison is
// safe on zero-padded ISO dates).
export function isCheckInDue(checkInWeekday: number, lastCheckin: string | null, todayIso: string): boolean {
  const occurrence = lastCheckInOccurrence(checkInWeekday, todayIso);
  return lastCheckin === null || lastCheckin < occurrence;
}
