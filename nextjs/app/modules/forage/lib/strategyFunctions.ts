import { Goal, GoalKind } from '../types/goal';
import {
  DietKind,
  DistributionKind,
  FloorKind,
  Program,
  ProgramStyle,
  ProteinBand,
  TrainingKind,
  ProgramInput,
} from '../types/program';
import { MacroTarget } from '../types/target';
import { createGoal, getActiveGoal } from './goalFunctions';
import {
  createProgram,
  getActiveProgram,
  repointActiveProgramGoal,
  seedInitialTargets,
} from './programFunctions';
import { getActiveTarget, setTarget } from './targetFunctions';
import { getLatestWeightEntry, getLatestWeightLb } from './weightFunctions';
import { estimateExpenditure } from './expenditure';
import { LB_PER_KG, isCheckInDue, todayIsoUtc } from './program';

// The "nutrition strategy" is not one table — it is the goal (what the user is
// trying to do), the program (how the targets are derived and re-checked), the
// resolved macro targets (the numbers in force), and the bodyweight/expenditure
// the coaching math ran on. Every consumer that wants to answer "am I on plan?"
// needs all four together, so they are assembled once here rather than by each
// caller re-deriving the joins. The individual pieces stay owned by
// goalFunctions / programFunctions / targetFunctions / weightFunctions.

export const GOAL_KINDS: GoalKind[] = ['lose', 'maintain', 'gain'];
export const PROGRAM_STYLES: ProgramStyle[] = ['coached', 'manual'];
export const PROTEIN_BANDS: ProteinBand[] = ['low', 'moderate', 'high', 'extra_high'];
export const DIET_KINDS: DietKind[] = ['balanced', 'low_fat', 'low_carb', 'keto'];
export const TRAINING_KINDS: TrainingKind[] = ['none', 'lifting', 'cardio', 'cardio_lifting'];
export const DISTRIBUTION_KINDS: DistributionKind[] = ['even', 'shifted'];
export const FLOOR_KINDS: FloorKind[] = ['standard', 'low'];

// Bodyweight as the strategy sees it: the number the coaching math used, plus
// where it came from. A null log_date with a non-null weight means forage has no
// weigh-in of its own and the value came through the app-level health store.
export interface StrategyBodyweight {
  weight_lb: number | null;
  log_date: string | null;
  body_fat_pct: number | null;
  source: 'forage' | 'health' | null;
}

// The active macro target, plus the per-bodyweight and percent-of-calorie
// restatements. A client asking "does my protein match the plan?" thinks in
// g/lb as often as in grams, and cannot derive it without a live bodyweight.
export interface StrategyTargets extends MacroTarget {
  protein_g_per_lb: number | null;
  protein_g_per_kg: number | null;
  protein_kcal_pct: number;
  carbs_kcal_pct: number;
  fat_kcal_pct: number;
}

export interface StrategyProgram extends Program {
  // Whether the weekly re-check is currently owed. Always false for manual
  // programs, which have no check-in at all.
  check_in_due: boolean;
}

export interface StrategyExpenditure {
  maintenance_kcal: number;
  method: string;
  window_days: number;
  avg_intake_kcal: number | null;
  weight_trend_lb_per_week: number | null;
}

export interface StrategySnapshot {
  // The date the targets were resolved for — the caller's forDate when given,
  // otherwise today. Targets are history-capable, so this matters.
  as_of_date: string;
  goal: Goal | null;
  program: StrategyProgram | null;
  targets: StrategyTargets | null;
  bodyweight: StrategyBodyweight;
  expenditure: StrategyExpenditure | null;
}

function pct(part: number, whole: number): number {
  if (!(whole > 0)) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Restates a raw MacroTarget against the bodyweight it was computed from.
function decorateTargets(target: MacroTarget, weightLb: number | null): StrategyTargets {
  const kcal = target.kcal;
  return {
    ...target,
    protein_g_per_lb: weightLb && weightLb > 0 ? round2(target.protein_g / weightLb) : null,
    protein_g_per_kg: weightLb && weightLb > 0 ? round2(target.protein_g / (weightLb / LB_PER_KG)) : null,
    protein_kcal_pct: pct(target.protein_g * 4, kcal),
    carbs_kcal_pct: pct(target.carbs_g * 4, kcal),
    fat_kcal_pct: pct(target.fat_g * 9, kcal),
  };
}

// Full strategy read. forDate (YYYY-MM-DD) resolves the targets that were in
// force on that date instead of the current ones; goal/program/bodyweight are
// always the live ones, since only the targets carry history.
export async function getStrategy(userId: string, forDate: string | null = null): Promise<StrategySnapshot> {
  const [goal, program, target, weightEntry] = await Promise.all([
    getActiveGoal(userId),
    getActiveProgram(userId),
    getActiveTarget(userId, forDate),
    getLatestWeightEntry(userId),
  ]);

  // Prefer forage's own weigh-in; fall back to the health store the same way the
  // coaching math does, so the reported bodyweight is the one the targets used.
  const weightLb = weightEntry ? weightEntry.weight_lb : await getLatestWeightLb(userId);
  const bodyweight: StrategyBodyweight = {
    weight_lb: weightLb,
    log_date: weightEntry ? weightEntry.log_date : null,
    body_fat_pct: weightEntry ? weightEntry.body_fat_pct : null,
    source: weightLb == null ? null : weightEntry ? 'forage' : 'health',
  };

  // The adaptive maintenance estimate behind a coached target. Reported even for
  // manual programs — knowing the demonstrated expenditure is what makes a
  // hand-entered calorie number interpretable.
  const estimate = await estimateExpenditure(userId, {
    trainingKind: program?.training_kind ?? 'none',
    latestWeightLb: weightLb,
  });

  return {
    as_of_date: forDate ?? todayIsoUtc(),
    goal,
    program: program
      ? {
          ...program,
          check_in_due:
            program.program_style === 'coached' && program.check_in_weekday != null
              ? isCheckInDue(program.check_in_weekday, program.last_checkin_date, todayIsoUtc())
              : false,
        }
      : null,
    targets: target ? decorateTargets(target, weightLb) : null,
    bodyweight,
    expenditure: {
      maintenance_kcal: estimate.expenditure_kcal,
      method: estimate.method,
      window_days: estimate.window_days,
      avg_intake_kcal: estimate.avg_intake_kcal,
      weight_trend_lb_per_week: estimate.weight_trend_lb_per_week,
    },
  };
}

// Patch semantics: every field is optional and anything omitted keeps its
// current value. `goal` and `program` are merged against the active goal/program
// before validation, so a caller can change one knob (say the protein band)
// without restating a whole program.
export interface StrategyUpdateInput {
  goal?: {
    goal_kind?: GoalKind;
    rate_lb_per_week?: number | null;
    target_weight_lb?: number | null;
  } | null;
  program?: {
    program_style?: ProgramStyle;
    protein_band?: ProteinBand;
    diet_kind?: DietKind;
    training_kind?: TrainingKind;
    distribution_kind?: DistributionKind;
    shifted_high_days?: number[] | null;
    floor_kind?: FloorKind;
    check_in_weekday?: number;
  } | null;
  macro_targets?: {
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  } | null;
}

export interface StrategyUpdateResult {
  // What actually changed, in the order it was applied — so a caller can report
  // "goal replaced, targets recomputed" without diffing two snapshots.
  changed: string[];
  strategy: StrategySnapshot;
}

// Thrown for caller error (bad enum, out-of-range number, missing prerequisite)
// so the MCP/API layer can answer 400-style instead of surfacing a 500.
export class StrategyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrategyInputError';
  }
}

// Creating or editing the strategy. Mirrors what the forage UI does across
// POST /api/goal, POST /api/program and POST /api/targets — including the
// consequences those routes chain (a new goal re-points the active program and
// recomputes coached macros), so an MCP client changing the plan lands in the
// same state as a user walking the wizard.
//
// Everything is validated and merged BEFORE the first write. The goal, program
// and target tables are three separate append-only writes with no shared
// transaction, so validating as we go would let a bad `program` land after a new
// goal row had already been created — leaving the plan half-changed.
export async function updateStrategy(
  userId: string,
  input: StrategyUpdateInput,
): Promise<StrategyUpdateResult> {
  if (!input.goal && !input.program && !input.macro_targets) {
    throw new StrategyInputError(
      'Refusing to apply empty update — pass at least one of goal, program, macro_targets.',
    );
  }

  const activeGoal = await getActiveGoal(userId);
  const activeProgram = await getActiveProgram(userId);

  // ── Validate + merge ──────────────────────────────────────────────────────

  // GOAL — merged onto the active goal. The goal table is append-only history,
  // so a change is written as a new row (createGoal ends the prior one).
  let goalWrite: { kind: GoalKind; rate: number | null; targetWeight: number | null } | null = null;
  if (input.goal) {
    const goalKind = input.goal.goal_kind ?? activeGoal?.goal_kind;
    if (!goalKind) throw new StrategyInputError('goal.goal_kind is required — there is no active goal to merge onto.');
    if (!GOAL_KINDS.includes(goalKind)) throw new StrategyInputError('goal.goal_kind must be lose|maintain|gain');

    let rate: number | null = null;
    let targetWeight: number | null = null;
    if (goalKind !== 'maintain') {
      const raw =
        input.goal.rate_lb_per_week !== undefined ? input.goal.rate_lb_per_week : activeGoal?.rate_lb_per_week ?? null;
      const r = Number(raw);
      // Same range the goal API enforces: (0, 4.4] lb/wk.
      if (!Number.isFinite(r) || r <= 0 || r > 4.4) {
        throw new StrategyInputError('goal.rate_lb_per_week must be in (0, 4.4] for a lose/gain goal');
      }
      rate = r;

      const rawWeight =
        input.goal.target_weight_lb !== undefined
          ? input.goal.target_weight_lb
          : activeGoal?.target_weight_lb ?? null;
      if (rawWeight != null) {
        const w = Number(rawWeight);
        if (!Number.isFinite(w) || w < 55 || w > 551) {
          throw new StrategyInputError('goal.target_weight_lb must be in [55, 551]');
        }
        targetWeight = Math.round(w * 100) / 100;
      }
    }
    goalWrite = { kind: goalKind, rate, targetWeight };
  }

  // PROGRAM — merged onto the active program. Switching to 'manual' requires
  // macro_targets, because a manual program has no way to derive them.
  let programWrite: ProgramInput | null = null;
  if (input.program) {
    // A program always belongs to a goal — either the one this call is creating
    // or the standing one.
    if (!activeGoal && !goalWrite) {
      throw new StrategyInputError('No active goal — set goal (goal.goal_kind) before creating a program.');
    }
    const style = input.program.program_style ?? activeProgram?.program_style ?? 'coached';
    if (!PROGRAM_STYLES.includes(style)) throw new StrategyInputError('program.program_style must be coached|manual');

    if (style === 'manual') {
      if (!input.macro_targets) {
        throw new StrategyInputError('A manual program needs macro_targets (kcal, protein_g, carbs_g, fat_g).');
      }
      programWrite = {
        program_style: 'manual',
        protein_band: null,
        diet_kind: null,
        training_kind: null,
        distribution_kind: null,
        shifted_high_days: null,
        floor_kind: null,
        check_in_weekday: null,
      };
    } else {
      // Coaching inputs only carry forward from an existing COACHED program — a
      // manual one has them all null, so switching manual→coached must state them.
      const prior = activeProgram?.program_style === 'coached' ? activeProgram : null;
      const proteinBand = input.program.protein_band ?? prior?.protein_band;
      const dietKind = input.program.diet_kind ?? prior?.diet_kind;
      const trainingKind = input.program.training_kind ?? prior?.training_kind;
      const distributionKind = input.program.distribution_kind ?? prior?.distribution_kind;
      const floorKind = input.program.floor_kind ?? prior?.floor_kind;
      const weekday = input.program.check_in_weekday ?? prior?.check_in_weekday;

      if (!proteinBand || !PROTEIN_BANDS.includes(proteinBand)) {
        throw new StrategyInputError('program.protein_band must be low|moderate|high|extra_high');
      }
      if (!dietKind || !DIET_KINDS.includes(dietKind)) {
        throw new StrategyInputError('program.diet_kind must be balanced|low_fat|low_carb|keto');
      }
      if (!trainingKind || !TRAINING_KINDS.includes(trainingKind)) {
        throw new StrategyInputError('program.training_kind must be none|lifting|cardio|cardio_lifting');
      }
      if (!distributionKind || !DISTRIBUTION_KINDS.includes(distributionKind)) {
        throw new StrategyInputError('program.distribution_kind must be even|shifted');
      }
      if (!floorKind || !FLOOR_KINDS.includes(floorKind)) {
        throw new StrategyInputError('program.floor_kind must be standard|low');
      }
      if (weekday == null || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
        throw new StrategyInputError('program.check_in_weekday must be an integer 1..7 (1=Mon)');
      }

      let shifted: number[] | null = null;
      if (distributionKind === 'shifted') {
        const rawDays =
          input.program.shifted_high_days !== undefined
            ? input.program.shifted_high_days
            : prior?.shifted_high_days ?? null;
        shifted = (rawDays ?? []).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
        if (shifted.length === 0 || shifted.length >= 7) {
          throw new StrategyInputError(
            'program.shifted_high_days must contain 1..6 weekdays when distribution_kind=shifted',
          );
        }
      }

      programWrite = {
        program_style: 'coached',
        protein_band: proteinBand,
        diet_kind: dietKind,
        training_kind: trainingKind,
        distribution_kind: distributionKind,
        shifted_high_days: shifted,
        floor_kind: floorKind,
        check_in_weekday: weekday,
      };
    }
  }

  // MACRO TARGETS — hand-entered numbers, taken as-is.
  let targetWrite: { kcal: number; protein_g: number; carbs_g: number; fat_g: number } | null = null;
  if (input.macro_targets) {
    const { kcal, protein_g, carbs_g, fat_g } = input.macro_targets;
    if (![kcal, protein_g, carbs_g, fat_g].every((n) => Number.isFinite(Number(n)) && Number(n) >= 0)) {
      throw new StrategyInputError('macro_targets kcal/protein_g/carbs_g/fat_g must be non-negative numbers');
    }
    targetWrite = {
      kcal: Number(kcal),
      protein_g: Number(protein_g),
      carbs_g: Number(carbs_g),
      fat_g: Number(fat_g),
    };
  }

  // ── Apply ─────────────────────────────────────────────────────────────────

  const changed: string[] = [];
  let goalId = activeGoal?.id ?? null;

  if (goalWrite) {
    const goal = await createGoal(userId, goalWrite.kind, goalWrite.rate, goalWrite.targetWeight);
    goalId = goal.id;
    changed.push('goal');
    // A new goal row must not leave the program pointing at the ended one.
    await repointActiveProgramGoal(userId, goal.id);
  }

  if (programWrite) {
    await createProgram(userId, goalId!, programWrite);
    changed.push('program');
  }

  if (targetWrite) {
    // Written last so an explicit target wins over anything a recompute produced.
    await setTarget(userId, targetWrite);
    changed.push('macro_targets');
  } else if (changed.length > 0 && (await seedInitialTargets(userId))) {
    // No explicit numbers — recompute from the (possibly new) goal and program,
    // exactly as the goal/program routes do. seedInitialTargets is a no-op for a
    // manual program or when there is no program at all.
    changed.push('targets_recomputed');
  }

  return { changed, strategy: await getStrategy(userId) };
}
