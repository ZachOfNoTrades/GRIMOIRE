import sql from 'mssql';
import { getFoodConnection, closeFoodConnection } from './db';
import { Program, ProgramInput } from '../types/program';
import { getActiveGoal } from './goalFunctions';
import { computeTargets, todayIsoUtc } from './program';
import { setTargetFromProgram } from './targetFunctions';
import { getLatestWeightLb } from './weightFunctions';
import { estimateExpenditure } from './expenditure';

function mapProgram(r: any): Program {
  return {
    id: r.id,
    user_id: r.user_id,
    goal_id: r.goal_id,
    program_style: r.program_style,
    protein_band: r.protein_band,
    diet_kind: r.diet_kind,
    training_kind: r.training_kind,
    distribution_kind: r.distribution_kind,
    shifted_high_days: r.shifted_high_days
      ? String(r.shifted_high_days).split(',').map(Number).filter((n: number) => Number.isInteger(n))
      : null,
    floor_kind: r.floor_kind,
    check_in_weekday: Number(r.check_in_weekday),
    last_checkin_date: r.last_checkin_date
      ? (typeof r.last_checkin_date === 'string'
          ? r.last_checkin_date
          : new Date(r.last_checkin_date).toISOString().slice(0, 10))
      : null,
    created_at: r.created_at?.toISOString?.() ?? String(r.created_at),
    ended_at: r.ended_at ? (r.ended_at?.toISOString?.() ?? String(r.ended_at)) : null,
  };
}

export async function getActiveProgram(userId: string): Promise<Program | null> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query<any>(
        `SELECT TOP 1 id, user_id, goal_id, program_style, protein_band, diet_kind, training_kind,
                distribution_kind, shifted_high_days, floor_kind, check_in_weekday,
                CONVERT(varchar(10), last_checkin_date, 23) AS last_checkin_date,
                created_at, ended_at
         FROM forage_program WHERE user_id=@userId AND ended_at IS NULL
         ORDER BY created_at DESC`
      );
    if (result.recordset.length === 0) return null;
    return mapProgram(result.recordset[0]);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function createProgram(
  userId: string,
  goalId: string,
  input: ProgramInput,
): Promise<Program> {
  let pool;
  try {
    pool = await getFoodConnection();

    // Capture the program being replaced BEFORE ending it, so its nutrient
    // overrides can be carried forward onto the new program below.
    const priorResult = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query<any>(`SELECT TOP 1 id FROM forage_program WHERE user_id=@userId AND ended_at IS NULL ORDER BY created_at DESC`);
    const priorProgramId: string | null = priorResult.recordset.length ? priorResult.recordset[0].id : null;

    await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`UPDATE forage_program SET ended_at=SYSUTCDATETIME() WHERE user_id=@userId AND ended_at IS NULL`);

    const shiftedCsv = input.shifted_high_days && input.shifted_high_days.length > 0
      ? input.shifted_high_days.slice().sort((a, b) => a - b).join(',')
      : null;

    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('goalId', sql.UniqueIdentifier, goalId)
      .input('style', sql.VarChar(16), input.program_style)
      .input('protein', sql.VarChar(16), input.protein_band)
      .input('diet', sql.VarChar(16), input.diet_kind)
      .input('training', sql.VarChar(16), input.training_kind)
      .input('distribution', sql.VarChar(16), input.distribution_kind)
      .input('shifted', sql.VarChar(32), shiftedCsv)
      .input('floor', sql.VarChar(16), input.floor_kind)
      .input('weekday', sql.TinyInt, input.check_in_weekday)
      .query<any>(
        `INSERT INTO forage_program
           (user_id, goal_id, program_style, protein_band, diet_kind, training_kind,
            distribution_kind, shifted_high_days, floor_kind, check_in_weekday)
         OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.goal_id, INSERTED.program_style,
                INSERTED.protein_band, INSERTED.diet_kind, INSERTED.training_kind,
                INSERTED.distribution_kind, INSERTED.shifted_high_days, INSERTED.floor_kind,
                INSERTED.check_in_weekday,
                CONVERT(varchar(10), INSERTED.last_checkin_date, 23) AS last_checkin_date,
                INSERTED.created_at, INSERTED.ended_at
         VALUES (@userId, @goalId, @style, @protein, @diet, @training, @distribution, @shifted, @floor, @weekday)`
      );
    const program = mapProgram(result.recordset[0]);

    // Carry the prior plan's nutrient overrides forward onto the new program so a
    // caffeine ceiling etc. isn't silently lost every time a program is rebuilt.
    if (priorProgramId) {
      await pool
        .request()
        .input('priorId', sql.UniqueIdentifier, priorProgramId)
        .input('newId', sql.UniqueIdentifier, program.id)
        .query(
          // Micro overrides live in nutrient_targets_v2 (scope='micro'); carry the
          // prior program's micro rows forward onto the new program.
          `INSERT INTO nutrient_targets_v2 (scope, program_id, nutrient_id, floor, target, ceiling, is_active, source)
           SELECT 'micro', @newId, nutrient_id, floor, target, ceiling, 1, 'manual'
           FROM nutrient_targets_v2 WHERE scope='micro' AND program_id = @priorId`
        );
    }

    return program;
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function endProgram(userId: string, programId: string): Promise<void> {
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('programId', sql.UniqueIdentifier, programId)
      .query(`UPDATE forage_program SET ended_at=SYSUTCDATETIME() WHERE user_id=@userId AND id=@programId AND ended_at IS NULL`);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Re-points the user's active program at a new goal. Called when the goal is
// edited under an existing program: the program keeps its coaching prefs but
// now belongs to (and derives its macros from) the current goal, instead of
// dangling at the just-ended goal row.
export async function repointActiveProgramGoal(userId: string, goalId: string): Promise<void> {
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('goalId', sql.UniqueIdentifier, goalId)
      .query(`UPDATE forage_program SET goal_id=@goalId WHERE user_id=@userId AND ended_at IS NULL`);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function updateCheckInDay(userId: string, programId: string, weekday: number): Promise<void> {
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('programId', sql.UniqueIdentifier, programId)
      .input('weekday', sql.TinyInt, weekday)
      .query(`UPDATE forage_program SET check_in_weekday=@weekday WHERE user_id=@userId AND id=@programId`);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Stamps a coached program's weekly check-in as done for `todayIso`. The only
// thing that clears isCheckInDue — called from checkinFunctions.applyCheckIn
// (explicit wizard confirm) and seedInitialTargets (program creation).
export async function markCheckIn(programId: string, todayIso: string): Promise<void> {
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('programId', sql.UniqueIdentifier, programId)
      .input('today', sql.Date, todayIso)
      .query(`UPDATE forage_program SET last_checkin_date=@today WHERE id=@programId`);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Seeds a freshly-created coached program's initial targets from the user's
// latest weigh-in — unconditional (no due-gate), since there's nothing to
// review yet at creation time. Weekly re-checks go through the explicit
// check-in wizard (checkinFunctions.applyCheckIn) instead.
export async function seedInitialTargets(userId: string): Promise<boolean> {
  const program = await getActiveProgram(userId);
  if (!program) return false;
  // Manual programs hold user-entered targets and never auto-recompute.
  if (program.program_style !== 'coached') return false;
  const goal = await getActiveGoal(userId);
  if (!goal) return false;

  const latestWeight = await getLatestWeightLb(userId);
  // Prefer the user's demonstrated expenditure (logged intake + weight trend)
  // over the coarse bodyweight formula; estimateExpenditure falls back to the
  // formula when there isn't enough history to trust the balance.
  const expenditure = await estimateExpenditure(userId, {
    trainingKind: program.training_kind!,
    latestWeightLb: latestWeight,
  });
  // Coaching inputs are guaranteed present on coached programs (guarded above).
  const targets = computeTargets({
    goal_kind: goal.goal_kind,
    rate_lb_per_week: goal.rate_lb_per_week,
    protein_band: program.protein_band!,
    diet_kind: program.diet_kind!,
    training_kind: program.training_kind!,
    floor_kind: program.floor_kind!,
    distribution_kind: program.distribution_kind!,
    shifted_high_days: program.shifted_high_days,
    latest_weight_lb: latestWeight,
    maintenance_kcal_override: expenditure.expenditure_kcal,
  });

  await setTargetFromProgram(userId, {
    kcal: targets.kcal,
    protein_g: targets.protein_g,
    carbs_g: targets.carbs_g,
    fat_g: targets.fat_g,
  });
  await markCheckIn(program.id, todayIsoUtc());
  return true;
}
