import { Program } from '../types/program';
import { Goal } from '../types/goal';
import { MacroTarget } from '../types/target';
import { getActiveProgram, markCheckIn } from './programFunctions';
import { getActiveGoal } from './goalFunctions';
import { computeTargets, isCheckInDue, todayIsoUtc, todayIsoLocal } from './program';
import { listWeights, getLatestWeightLb } from './weightFunctions';
import { estimateExpenditure, ABS_PARTIAL_FLOOR_KCAL } from './expenditure';
import { getActiveTarget, setTargetFromProgram } from './targetFunctions';
import { getNutrientOverrides, getResolvedNutrientTargets } from './nutrientTargetFunctions';
import { listEntries, computeTotals, getRangeTotals, getNutrientDailySeries } from './entryFunctions';
import { getSettings } from './settingsFunctions';
import { findCheckInHold } from './checkInHold';
import { CheckInHold } from '../types/checkInHold';
import { DEFAULT_SETTINGS } from '../types/settings';
import { getDashboardCards } from './dashboardFunctions';
import { listNutrients } from './nutrientFunctions';
import { MACROS } from '../utils/nutrientLedger';

// Everything below powers the check-in wizard: a read-only preview (which
// slides apply, and their content) plus the explicit confirm/apply action
// that replaces the old silent GET-triggered recompute.

function shiftDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export interface WeighInStats {
  weighInsThisWeek: number;
  hasTodayWeighIn: boolean;
  minPerWeek: number;
  needsWeighIn: boolean;
}

// Count the weigh-ins of the trailing 7 days, today included, and flag the week as needing one when it has fewer than minPerWeek
// NOTE: weight_log is unique per (user_id, log_date), so its row count is the count of weigh-in days
export async function getWeighInStats(userId: string, todayIso: string, minPerWeek: number): Promise<WeighInStats> {
  const sinceIso = shiftDate(todayIso, -6);
  const weights = await listWeights(userId, sinceIso);
  const weighInsThisWeek = weights.length;
  return {
    weighInsThisWeek,
    hasTodayWeighIn: weights.some((w) => w.log_date === todayIso),
    minPerWeek,
    needsWeighIn: weighInsThisWeek < minPerWeek,
  };
}

export interface PartialLogDay {
  date: string;
  loggedKcal: number;
  targetKcal: number;
  pctOfTarget: number;
}

const PARTIAL_LOG_THRESHOLD = 0.75;

// Flags days in the 7 fully-elapsed days strictly before todayIso that logged
// something but less than 75% of that day's calorie target — today is excluded
// since it's still in progress and would false-positive every morning. Days
// with zero logged (genuinely not logged / rest day) are not flagged.
export async function findPartialLogDays(userId: string, todayIso: string): Promise<PartialLogDay[]> {
  const days: string[] = [];
  for (let i = 1; i <= 7; i++) days.push(shiftDate(todayIso, -i));

  const flagged: PartialLogDay[] = [];
  for (const date of days) {
    const [entries, target] = await Promise.all([
      listEntries(userId, date),
      getActiveTarget(userId, date),
    ]);
    if (!target || target.kcal <= 0) continue; // no program/target yet on this day
    const loggedKcal = computeTotals(entries).kcal;
    if (loggedKcal > 0 && loggedKcal < target.kcal * PARTIAL_LOG_THRESHOLD) {
      flagged.push({
        date,
        loggedKcal: Math.round(loggedKcal),
        targetKcal: target.kcal,
        pctOfTarget: Math.round((loggedKcal / target.kcal) * 100),
      });
    }
  }
  return flagged.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface MacroValues {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface MacroDiff {
  current: MacroValues | null;
  proposed: MacroValues;
  latestWeightLb: number | null;
  // The calorie number the recompute wanted before the per-check-in rate limit
  // clipped it — null whenever nothing was clipped (no standing target, or the
  // move was already within the cap). Set, it means `proposed.kcal` is a
  // deliberate partial step toward `uncappedKcal`, which the wizard says out
  // loud rather than leaving the user to wonder why the number stopped short.
  uncappedKcal: number | null;
  // Set when the week has too little data to change the targets and a current target exists, so `proposed` repeats `current`
  hold: CheckInHold | null;
}

// Whether two macro sets are the same number-for-number — the check that keeps
// the wizard honest (see applyCheckIn).
function sameMacros(a: MacroValues, b: MacroValues): boolean {
  return (
    a.kcal === b.kcal &&
    a.protein_g === b.protein_g &&
    a.carbs_g === b.carbs_g &&
    a.fat_g === b.fat_g
  );
}

// Count the complete logged days in the 7 fully-elapsed days before todayIso
// NOTE: A day counts from the expenditure estimator's absolute calorie floor, to avoid counting a day of drinks only
async function countCompleteLoggedDays(userId: string, todayIso: string): Promise<number> {
  const series = await getNutrientDailySeries(userId, 'kcal', shiftDate(todayIso, -7), shiftDate(todayIso, -1));
  return series.filter((day) => day.value >= ABS_PARTIAL_FLOOR_KCAL).length;
}

// Compare the current targets with what a recompute proposes now, keeping them when the week falls short of the user's minimums
export async function computeMacroDiff(userId: string, program: Program, goal: Goal): Promise<MacroDiff> {
  const todayLocal = todayIsoLocal();
  const [current, latestWeightLb, settings, loggedDays, weighIns] = await Promise.all([
    getActiveTarget(userId),
    getLatestWeightLb(userId),
    getSettings(userId),
    countCompleteLoggedDays(userId, todayLocal),
    listWeights(userId, shiftDate(todayLocal, -6)),
  ]);
  const currentValues = current
    ? { kcal: current.kcal, protein_g: current.protein_g, carbs_g: current.carbs_g, fat_g: current.fat_g }
    : null;

  // Keep the current targets when the week falls short of the user's minimums; with no target yet, compute one anyway
  const hold = findCheckInHold(
    { logged_days: loggedDays, weigh_ins: weighIns.length },
    { min_logged_days: settings.checkin_min_logged_days, min_weigh_ins: settings.checkin_min_weigh_ins },
  );
  if (hold && currentValues) {
    return { current: currentValues, proposed: currentValues, latestWeightLb, uncappedKcal: null, hold };
  }

  // Re-estimate expenditure from the trailing window's intake + weight trend so
  // each check-in adapts to demonstrated energy balance, not just bodyweight
  // drift (falls back to the bodyweight formula when history is thin).
  const expenditure = await estimateExpenditure(userId, {
    trainingKind: program.training_kind!,
    latestWeightLb,
  });

  const computeInput = {
    goal_kind: goal.goal_kind,
    rate_lb_per_week: goal.rate_lb_per_week,
    protein_band: program.protein_band!,
    diet_kind: program.diet_kind!,
    training_kind: program.training_kind!,
    floor_kind: program.floor_kind!,
    distribution_kind: program.distribution_kind!,
    shifted_high_days: program.shifted_high_days,
    latest_weight_lb: latestWeightLb,
    maintenance_kcal_override: expenditure.expenditure_kcal,
  };

  // Rate-limited against the standing target so one check-in can't move the
  // budget by hundreds of kcal (see maxCheckInKcalChange). Computed twice rather
  // than having computeTargets hand back both numbers: kcal is re-derived from
  // the rounded macro grams at the end, so running the whole function uncapped
  // is the only way to get an apples-to-apples "what it wanted" figure.
  const proposed = computeTargets({ ...computeInput, previous_kcal: current?.kcal ?? null });
  const uncapped = computeTargets(computeInput);

  return {
    current: currentValues,
    proposed: { kcal: proposed.kcal, protein_g: proposed.protein_g, carbs_g: proposed.carbs_g, fat_g: proposed.fat_g },
    latestWeightLb,
    uncappedKcal: uncapped.kcal === proposed.kcal ? null : uncapped.kcal,
    hold: null,
  };
}

// One card of the dashboard's Nutrition section, averaged over the week the
// check-in covers. Same key space as forage_dashboard_cards: a synthetic macro
// key ('kcal','protein','fat','carbs') or a nutrients.code micro. `category` is
// null for the macro cards (they aren't rows in `nutrients`); the wizard uses it
// to resolve the same swatch color the dashboard tile draws.
export interface DashboardNutrientSummary {
  key: string;
  label: string;
  unit: string;
  category: string | null;
  avgPerDay: number;
  floor: number | null;
  target: number | null;
  ceiling: number | null;
  isCustom: boolean;
}

export interface DashboardNutrientReview {
  startDate: string;
  endDate: string;
  loggedDays: number;
  cards: DashboardNutrientSummary[];
}

// Length of the review window, in fully-elapsed days before today.
const DASHBOARD_REVIEW_DAYS = 7;

// Macro card key -> the field it reads on BOTH DailyTotals and MacroTarget
// (the two share these names), plus its ledger metadata for label/unit.
const MACRO_CARD_FIELD: Record<string, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'> = {
  kcal: 'kcal',
  protein: 'protein_g',
  carbs: 'carbs_g',
  fat: 'fat_g',
};
const MACRO_CARD_META = new Map(MACROS.map((m) => [m.key as string, m]));

// The nutrients the user actually watches — their customized dashboard Nutrition
// section — averaged across the logged days of the week just finished, each with
// the same floor/target/ceiling band the dashboard tile plots. Powers the
// wizard's week-in-review slide, so a check-in shows how the tracked nutrients
// went before it asks about targets.
//
// Averaged over LOGGED days (getRangeTotals' divisor), not calendar days, so an
// unlogged day doesn't read as a day of zero intake. Today is excluded — it's
// still in progress and would drag every average down (same reason
// findPartialLogDays skips it).
export async function buildDashboardNutrientReview(
  userId: string,
  todayIso: string,
): Promise<DashboardNutrientReview> {
  const endDate = shiftDate(todayIso, -1);
  const startDate = shiftDate(todayIso, -DASHBOARD_REVIEW_DAYS);

  const [cardKeys, range, nutrients, bands, macroTarget] = await Promise.all([
    getDashboardCards(userId, 'nutrition'),
    getRangeTotals(userId, startDate, endDate),
    listNutrients(),
    getResolvedNutrientTargets(userId),
    getActiveTarget(userId),
  ]);

  const nutrientByCode = new Map(nutrients.map((n) => [n.code, n]));
  const bandByCode = new Map(bands.map((b) => [b.code, b]));

  const cards: DashboardNutrientSummary[] = [];
  for (const key of cardKeys) {
    const macro = MACRO_CARD_META.get(key);
    if (macro) {
      const field = MACRO_CARD_FIELD[key];
      cards.push({
        key,
        label: macro.label,
        unit: macro.unit,
        category: null,
        avgPerDay: Math.round(range.totals[field]),
        // Macros carry a single goal (no floor/ceiling band) — the meter draws a
        // lone target caret, matching the dashboard tile.
        floor: null,
        target: macroTarget ? macroTarget[field] : null,
        ceiling: null,
        isCustom: false,
      });
      continue;
    }

    // Micro card. An unknown code (nutrient since deactivated) is skipped rather
    // than rendered blank — the same thing getDashboardCards does on read.
    const nutrient = nutrientByCode.get(key);
    if (!nutrient) continue;
    const band = bandByCode.get(key);
    const consumed = range.totals.micros?.[key] ?? 0;
    cards.push({
      key,
      label: nutrient.name,
      unit: nutrient.unit,
      category: nutrient.category,
      // Whole numbers for mg/mcg, one decimal for grams so trace amounts survive.
      avgPerDay: nutrient.unit === 'g' ? Math.round(consumed * 10) / 10 : Math.round(consumed),
      // Each marker stays independent so a ceiling-only nutrient doesn't draw a
      // target at its cap.
      floor: band?.floor ?? null,
      target: band?.target ?? null,
      ceiling: band?.ceiling ?? null,
      isCustom: band?.source === 'manual',
    });
  }

  return { startDate, endDate, loggedDays: range.loggedDays, cards };
}

export type CheckInIneligibleReason = 'no_program' | 'not_coached' | 'no_goal' | 'not_due';

export interface CheckInPreview {
  eligible: boolean;
  reason: CheckInIneligibleReason | null;
  weekday: number | null;
  weighIns: WeighInStats;
  partialLogDays: PartialLogDay[];
  macroDiff: MacroDiff | null;
  dashboardNutrients: DashboardNutrientReview;
  nutrientOverrides: { nutrient_id: string; code: string; floor: number | null; target: number | null; ceiling: number | null }[];
}

// Only ever paired with eligible:false, where the wizard renders a message
// instead of slides — so needsWeighIn stays false rather than implying a prompt.
const EMPTY_WEIGH_INS: WeighInStats = { weighInsThisWeek: 0, hasTodayWeighIn: false, minPerWeek: DEFAULT_SETTINGS.checkin_min_weigh_ins, needsWeighIn: false };

// Likewise never rendered — an empty card list is what keeps the review slide
// out of the deck, so the dates don't need to describe a real window.
const EMPTY_DASHBOARD_REVIEW: DashboardNutrientReview = { startDate: '', endDate: '', loggedDays: 0, cards: [] };

function ineligiblePreview(reason: CheckInIneligibleReason, weekday: number | null = null): CheckInPreview {
  return { eligible: false, reason, weekday, weighIns: EMPTY_WEIGH_INS, partialLogDays: [], macroDiff: null, dashboardNutrients: EMPTY_DASHBOARD_REVIEW, nutrientOverrides: [] };
}

// Read-only — assembles everything the wizard needs to decide which slides to
// show and populate them. Never mutates anything (that's applyCheckIn's job).
export async function assembleCheckInPreview(userId: string): Promise<CheckInPreview> {
  const program = await getActiveProgram(userId);
  if (!program) return ineligiblePreview('no_program');
  if (program.program_style !== 'coached') return ineligiblePreview('not_coached');

  const goal = await getActiveGoal(userId);
  if (!goal) return ineligiblePreview('no_goal', program.check_in_weekday);

  const today = todayIsoUtc();
  if (!isCheckInDue(program.check_in_weekday!, program.last_checkin_date, today)) {
    return ineligiblePreview('not_due', program.check_in_weekday);
  }

  // Local, not UTC — weigh-ins/food entries are dated by local calendar day.
  const todayLocal = todayIsoLocal();
  const settings = await getSettings(userId);
  const [weighIns, partialLogDays, macroDiff, dashboardNutrients, nutrientOverrides] = await Promise.all([
    getWeighInStats(userId, todayLocal, settings.checkin_min_weigh_ins),
    findPartialLogDays(userId, todayLocal),
    computeMacroDiff(userId, program, goal),
    buildDashboardNutrientReview(userId, todayLocal),
    getNutrientOverrides(userId),
  ]);

  return {
    eligible: true,
    reason: null,
    weekday: program.check_in_weekday,
    weighIns,
    partialLogDays,
    macroDiff,
    dashboardNutrients,
    nutrientOverrides,
  };
}

export type ApplyCheckInReason = CheckInIneligibleReason | 'stale_preview';

export interface ApplyCheckInResult {
  applied: boolean;
  reason?: ApplyCheckInReason;
  target?: MacroTarget;
  previous?: MacroTarget | null;
  // On 'stale_preview': the numbers a fresh recompute produces, so the caller
  // can re-render them and ask for a second confirmation.
  proposed?: MacroValues;
}

// Complete a due check-in, writing the proposed targets unless the week falls short of the user's minimums or the user keeps the current ones
// NOTE: `expected` is the macro set the wizard showed. When a fresh recompute disagrees, such as after a weigh-in logged
//       mid-wizard, nothing is written and the recomputed numbers are returned with `stale_preview`; keeping the current
//       targets skips this check. `expected` is only compared, never written, to avoid a client setting its own targets
export async function applyCheckIn(
  userId: string,
  expected?: MacroValues | null,
  isKeepingCurrent = false,
): Promise<ApplyCheckInResult> {
  const program = await getActiveProgram(userId);
  if (!program) return { applied: false, reason: 'no_program' };
  if (program.program_style !== 'coached') return { applied: false, reason: 'not_coached' };

  const goal = await getActiveGoal(userId);
  if (!goal) return { applied: false, reason: 'no_goal' };

  const today = todayIsoUtc();
  if (!isCheckInDue(program.check_in_weekday!, program.last_checkin_date, today)) {
    return { applied: false, reason: 'not_due' };
  }

  const [previous, { proposed, hold }] = await Promise.all([
    getActiveTarget(userId),
    computeMacroDiff(userId, program, goal),
  ]);
  if (expected && !isKeepingCurrent && !sameMacros(expected, proposed)) {
    return { applied: false, reason: 'stale_preview', proposed };
  }

  // Complete a held or declined check-in without writing a target, as it keeps the current one
  if ((hold || isKeepingCurrent) && previous) {
    await markCheckIn(program.id, today);
    return { applied: true, target: previous, previous };
  }
  const target = await setTargetFromProgram(userId, proposed);
  await markCheckIn(program.id, today);

  return { applied: true, target, previous };
}
