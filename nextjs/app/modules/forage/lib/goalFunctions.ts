import sql from 'mssql';
import { getFoodConnection, closeFoodConnection } from './db';
import { Goal, GoalKind } from '../types/goal';

function mapGoal(r: any): Goal {
  return {
    id: r.id,
    user_id: r.user_id,
    goal_kind: r.goal_kind as GoalKind,
    rate_lb_per_week: r.rate_lb_per_week == null ? null : Number(r.rate_lb_per_week),
    target_weight_lb: r.target_weight_lb == null ? null : Number(r.target_weight_lb),
    created_at: r.created_at?.toISOString?.() ?? String(r.created_at),
    ended_at: r.ended_at ? (r.ended_at?.toISOString?.() ?? String(r.ended_at)) : null,
  };
}

export async function getActiveGoal(userId: string): Promise<Goal | null> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query<any>(
        `SELECT TOP 1 id, user_id, goal_kind, rate_lb_per_week, target_weight_lb, created_at, ended_at
         FROM forage_goal WHERE user_id=@userId AND ended_at IS NULL
         ORDER BY created_at DESC`
      );
    if (result.recordset.length === 0) return null;
    return mapGoal(result.recordset[0]);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function createGoal(
  userId: string,
  goalKind: GoalKind,
  rateLbPerWeek: number | null,
  targetWeightLb: number | null,
): Promise<Goal> {
  let pool;
  try {
    pool = await getFoodConnection();
    // End any active goal first
    await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`UPDATE forage_goal SET ended_at=SYSUTCDATETIME() WHERE user_id=@userId AND ended_at IS NULL`);
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('goalKind', sql.VarChar(16), goalKind)
      .input('rate', sql.Decimal(4, 2), rateLbPerWeek)
      .input('targetWeight', sql.Decimal(6, 2), targetWeightLb)
      .query<any>(
        `INSERT INTO forage_goal (user_id, goal_kind, rate_lb_per_week, target_weight_lb)
         OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.goal_kind,
                INSERTED.rate_lb_per_week, INSERTED.target_weight_lb, INSERTED.created_at, INSERTED.ended_at
         VALUES (@userId, @goalKind, @rate, @targetWeight)`
      );
    return mapGoal(result.recordset[0]);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function listGoals(userId: string): Promise<Goal[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query<any>(
        `SELECT id, user_id, goal_kind, rate_lb_per_week, target_weight_lb, created_at, ended_at
         FROM forage_goal WHERE user_id=@userId
         ORDER BY created_at DESC`
      );
    return result.recordset.map(mapGoal);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

export async function endGoal(userId: string, goalId: string): Promise<void> {
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('goalId', sql.UniqueIdentifier, goalId)
      .query(`UPDATE forage_goal SET ended_at=SYSUTCDATETIME() WHERE user_id=@userId AND id=@goalId AND ended_at IS NULL`);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}
