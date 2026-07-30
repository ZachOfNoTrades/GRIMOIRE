import { Program } from '../types/program';
import { Goal } from '../types/goal';
import { MacroTarget } from '../types/target';
import { getActiveProgram, markCheckIn } from './programFunctions';
import { getActiveGoal } from './goalFunctions';
import { computeTargets, isCheckInDue, todayIsoUtc, todayIsoLocal } from './program';
import { listWeights, getLatestWeightLb } from './weightFunctions';
import { estimateExpenditure } from './expenditure';
import { getActiveTarget, setTargetFromProgram } from './targetFunctions';
import { getNutrientOverrides } from './nutrientTargetFunctions';
import { listEntries, computeTotals } from './entryFunctions';

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
}

// Distinct weigh-in days in the trailing 7 days (today included), and whether
// today specifically has one. weight_log is unique per (user_id, log_date), so
// a plain count of rows in range is the distinct-day count.
export async function getWeighInStats(userId: string, todayIso: string): Promise<WeighInStats> {
  const sinceIso = shiftDate(todayIso, -6);
  const weights = await listWeights(userId, sinceIso);
  return {
    weighInsThisWeek: weights.length,
    hasTodayWeighIn: weights.some((w) => w.log_date === todayIso),
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

// current vs. what a recompute would produce right now — the same input
// assembly seedInitialTargets/the old runRecompute used.
export async function computeMacroDiff(userId: string, program: Program, goal: Goal): Promise<MacroDiff> {
  const [current, latestWeightLb] = await Promise.all([
    getActiveTarget(userId),
    getLatestWeightLb(userId),
  ]);

  // Re-estimate expenditure from the trailing window's intake + weight trend so
  // each check-in adapts to demonstrated energy balance, not just bodyweight
  // drift (falls back to the bodyweight formula when history is thin).
  const expenditure = await estimateExpenditure(userId, {
    trainingKind: program.training_kind!,
    latestWeightLb,
  });

  const proposed = computeTargets({
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
  });

  return {
    current: current ? { kcal: current.kcal, protein_g: current.protein_g, carbs_g: current.carbs_g, fat_g: current.fat_g } : null,
    proposed: { kcal: proposed.kcal, protein_g: proposed.protein_g, carbs_g: proposed.carbs_g, fat_g: proposed.fat_g },
    latestWeightLb,
  };
}

export type CheckInIneligibleReason = 'no_program' | 'not_coached' | 'no_goal' | 'not_due';

export interface CheckInPreview {
  eligible: boolean;
  reason: CheckInIneligibleReason | null;
  weekday: number | null;
  weighIns: WeighInStats;
  partialLogDays: PartialLogDay[];
  macroDiff: MacroDiff | null;
  nutrientOverrides: { nutrient_id: string; code: string; floor: number | null; target: number | null; ceiling: number | null }[];
}

const EMPTY_WEIGH_INS: WeighInStats = { weighInsThisWeek: 0, hasTodayWeighIn: false };

function ineligiblePreview(reason: CheckInIneligibleReason, weekday: number | null = null): CheckInPreview {
  return { eligible: false, reason, weekday, weighIns: EMPTY_WEIGH_INS, partialLogDays: [], macroDiff: null, nutrientOverrides: [] };
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
  const [weighIns, partialLogDays, macroDiff, nutrientOverrides] = await Promise.all([
    getWeighInStats(userId, todayLocal),
    findPartialLogDays(userId, todayLocal),
    computeMacroDiff(userId, program, goal),
    getNutrientOverrides(userId),
  ]);

  return {
    eligible: true,
    reason: null,
    weekday: program.check_in_weekday,
    weighIns,
    partialLogDays,
    macroDiff,
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

// The explicit "confirm" action — replaces the old silent GET-triggered
// runRecompute(userId, false). Re-does the same gating as
// assembleCheckInPreview as defense-in-depth against a stale client (e.g. a
// second tab, or the wizard sitting open past midnight).
//
// `expected` is the macro set the wizard actually showed the user on its diff
// slide. Because this recomputes from scratch rather than applying whatever the
// preview returned, the two can disagree whenever the inputs moved in between —
// the common case being a weigh-in logged mid-wizard, which shifts both the
// bodyweight terms and the expenditure estimate. That silently wrote a target
// the user never agreed to (the slide reading 2,600 while the check-in stored
// 2,300). So: when the caller says what it showed and a fresh compute disagrees,
// refuse and hand back the new numbers instead of applying either one. Callers
// that pass nothing (scripts, older clients) keep the old recompute-and-apply
// behavior. Note we never apply `expected` itself — it's a client-supplied
// value used only as a comparison, so this can't be used to set arbitrary targets.
export async function applyCheckIn(
  userId: string,
  expected?: MacroValues | null,
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

  const [previous, { proposed }] = await Promise.all([
    getActiveTarget(userId),
    computeMacroDiff(userId, program, goal),
  ]);
  if (expected && !sameMacros(expected, proposed)) {
    return { applied: false, reason: 'stale_preview', proposed };
  }
  const target = await setTargetFromProgram(userId, proposed);
  await markCheckIn(program.id, today);

  return { applied: true, target, previous };
}
