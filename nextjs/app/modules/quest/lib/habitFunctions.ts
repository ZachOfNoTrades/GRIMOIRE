import sql from 'mssql';
import { getQuestConnection } from './db';
import { Habit } from '../types/habit';
import { Difficulty } from '../types/task';
import { getFactors, getCoinDamage, getHealthDamage } from './settingsFunctions';
import { applyDamage, DamageOutcome } from './userStateFunctions';

interface RawHabit {
  id: string;
  user_id: string;
  title: string;
  difficulty: Difficulty;
  allow_positive: number | boolean;
  allow_negative: number | boolean;
  manual_reward_override: number | null;
  ts_created: Date;
}

const HABIT_COLUMNS = `id, user_id, title, difficulty,
  CAST(allow_positive AS BIT) AS allow_positive,
  CAST(allow_negative AS BIT) AS allow_negative,
  CAST(manual_reward_override AS FLOAT) AS manual_reward_override,
  ts_created`;

const HABIT_OUTPUT_COLUMNS = `INSERTED.id, INSERTED.user_id, INSERTED.title, INSERTED.difficulty,
  CAST(INSERTED.allow_positive AS BIT) AS allow_positive,
  CAST(INSERTED.allow_negative AS BIT) AS allow_negative,
  CAST(INSERTED.manual_reward_override AS FLOAT) AS manual_reward_override,
  INSERTED.ts_created`;

function toHabit(r: RawHabit): Habit {
  return {
    id: r.id,
    user_id: r.user_id,
    title: r.title,
    difficulty: r.difficulty,
    allow_positive: !!r.allow_positive,
    allow_negative: !!r.allow_negative,
    manual_reward_override: r.manual_reward_override != null ? Number(r.manual_reward_override) : null,
    ts_created: r.ts_created,
  };
}

// Normalize an incoming override value: only a finite number >= 0 counts as an override,
// anything else (null / undefined / NaN / negative) clears it back to difficulty-driven.
function normalizeRewardOverride(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function listHabits(userId: string): Promise<Habit[]> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<RawHabit>(
      `SELECT ${HABIT_COLUMNS}
       FROM quest_habits
       WHERE user_id = @userId
       ORDER BY ts_created DESC`
    );
  return res.recordset.map(toHabit);
}

export interface HabitInput {
  title: string;
  difficulty: Difficulty;
  allowPositive: boolean;
  allowNegative: boolean;
  // null/undefined = no override (use the per-difficulty factor).
  manualRewardOverride?: number | null;
}

export async function createHabit(userId: string, input: HabitInput): Promise<Habit> {
  if (!input.allowPositive && !input.allowNegative) {
    throw new Error('Habit must allow at least one direction');
  }
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('title', sql.NVarChar(500), input.title)
    .input('difficulty', sql.NVarChar(20), input.difficulty)
    .input('allowPositive', sql.Bit, input.allowPositive ? 1 : 0)
    .input('allowNegative', sql.Bit, input.allowNegative ? 1 : 0)
    .input('manualReward', sql.Decimal(10, 2), normalizeRewardOverride(input.manualRewardOverride))
    .query<RawHabit>(
      `INSERT INTO quest_habits (user_id, title, difficulty, allow_positive, allow_negative, manual_reward_override)
       OUTPUT ${HABIT_OUTPUT_COLUMNS}
       VALUES (@userId, @title, @difficulty, @allowPositive, @allowNegative, @manualReward)`
    );
  return toHabit(res.recordset[0]);
}

export async function updateHabit(userId: string, habitId: string, input: HabitInput): Promise<Habit | null> {
  if (!input.allowPositive && !input.allowNegative) {
    throw new Error('Habit must allow at least one direction');
  }
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('id', sql.UniqueIdentifier, habitId)
    .input('title', sql.NVarChar(500), input.title)
    .input('difficulty', sql.NVarChar(20), input.difficulty)
    .input('allowPositive', sql.Bit, input.allowPositive ? 1 : 0)
    .input('allowNegative', sql.Bit, input.allowNegative ? 1 : 0)
    .input('manualReward', sql.Decimal(10, 2), normalizeRewardOverride(input.manualRewardOverride))
    .query<RawHabit>(
      `UPDATE quest_habits
       SET title = @title, difficulty = @difficulty, allow_positive = @allowPositive, allow_negative = @allowNegative,
           manual_reward_override = @manualReward
       OUTPUT ${HABIT_OUTPUT_COLUMNS}
       WHERE id = @id AND user_id = @userId`
    );
  const r = res.recordset[0];
  return r ? toHabit(r) : null;
}

export async function deleteHabit(userId: string, habitId: string): Promise<boolean> {
  const pool = await getQuestConnection();
  const res = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('id', sql.UniqueIdentifier, habitId)
    .query(`DELETE FROM quest_habits WHERE id = @id AND user_id = @userId`);
  return (res.rowsAffected[0] ?? 0) > 0;
}

export interface HabitTapResult {
  habit: Habit;
  delta: number;
  damage: DamageOutcome | null;
}

export async function tapHabit(userId: string, habitId: string, direction: 'positive' | 'negative'): Promise<HabitTapResult | null> {
  const pool = await getQuestConnection();
  const habitRes = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('id', sql.UniqueIdentifier, habitId)
    .query<RawHabit>(
      `SELECT ${HABIT_COLUMNS} FROM quest_habits WHERE id = @id AND user_id = @userId`
    );
  const raw = habitRes.recordset[0];
  if (!raw) return null;
  const habit = toHabit(raw);
  if (direction === 'positive' && !habit.allow_positive) return null;
  if (direction === 'negative' && !habit.allow_negative) return null;

  let delta = 0;
  if (direction === 'positive') {
    // A manual override replaces the difficulty-derived reward for this habit only.
    if (habit.manual_reward_override != null) {
      delta = Math.max(0, habit.manual_reward_override);
    } else {
      const factors = await getFactors(userId);
      delta = Math.max(0, factors[habit.difficulty] ?? 0);
    }
  } else {
    const coinDamage = await getCoinDamage(userId);
    delta = -Math.max(0, coinDamage[habit.difficulty]);
  }

  if (delta !== 0) {
    await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('delta', sql.Decimal(10, 2), delta)
      .input('reason', sql.NVarChar(500), `${direction === 'positive' ? 'Habit +' : 'Habit −'}: ${habit.title}`)
      .input('refId', sql.UniqueIdentifier, habit.id)
      .query(
        `INSERT INTO quest_ledger (user_id, delta, reason, ref_type, ref_id)
         VALUES (@userId, @delta, @reason, 'habit', @refId)`
      );
  }

  let damage: DamageOutcome | null = null;
  if (direction === 'negative') {
    const healthDamage = await getHealthDamage(userId);
    const hp = Math.max(0, healthDamage[habit.difficulty]);
    if (hp > 0) {
      damage = await applyDamage(userId, hp, `Habit: ${habit.title}`);
    }
  }
  return { habit, delta, damage };
}
