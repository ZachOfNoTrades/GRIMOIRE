import sql from 'mssql';
import { getQuestConnection } from './db';
import { Reward } from '../types/reward';

export async function listRewards(userId: string): Promise<Reward[]> {
  const pool = await getQuestConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<Reward>(
      `SELECT id, user_id, name, cost, ts_created
       FROM quest_rewards
       WHERE user_id = @userId
       ORDER BY cost ASC, name ASC`
    );
  return result.recordset;
}

export async function createReward(userId: string, name: string, cost: number): Promise<Reward> {
  const pool = await getQuestConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('name', sql.NVarChar(255), name)
    .input('cost', sql.Int, cost)
    .query<Reward>(
      `INSERT INTO quest_rewards (user_id, name, cost)
       OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.name, INSERTED.cost, INSERTED.ts_created
       VALUES (@userId, @name, @cost)`
    );
  return result.recordset[0];
}

export async function deleteReward(userId: string, rewardId: string): Promise<boolean> {
  const pool = await getQuestConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('id', sql.UniqueIdentifier, rewardId)
    .query(`DELETE FROM quest_rewards WHERE id = @id AND user_id = @userId`);
  return (result.rowsAffected[0] ?? 0) > 0;
}

export type SpendResult =
  | { ok: true; spent: number; balance: number }
  | { ok: false; reason: 'not_found' | 'insufficient'; balance: number };

export async function spendOnReward(userId: string, rewardId: string): Promise<SpendResult> {
  const pool = await getQuestConnection();
  const tx = pool.transaction();
  await tx.begin();
  try {
    const lookup = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('id', sql.UniqueIdentifier, rewardId)
      .query<Reward>(
        `SELECT id, user_id, name, cost, ts_created
         FROM quest_rewards
         WHERE id = @id AND user_id = @userId`
      );
    const reward = lookup.recordset[0];
    if (!reward) {
      await tx.rollback();
      return { ok: false, reason: 'not_found', balance: 0 };
    }

    const balRow = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query<{ balance: number }>(
        `SELECT ISNULL(SUM(delta), 0) AS balance FROM quest_ledger WITH (UPDLOCK, HOLDLOCK) WHERE user_id = @userId`
      );
    const balance = balRow.recordset[0]?.balance ?? 0;
    if (balance < reward.cost) {
      await tx.rollback();
      return { ok: false, reason: 'insufficient', balance };
    }

    await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('delta', sql.Decimal(10, 2), -reward.cost)
      .input('reason', sql.NVarChar(500), `Spent on: ${reward.name}`)
      .input('refId', sql.UniqueIdentifier, rewardId)
      .query(
        `INSERT INTO quest_ledger (user_id, delta, reason, ref_type, ref_id)
         VALUES (@userId, @delta, @reason, 'reward', @refId)`
      );

    await tx.commit();
    return { ok: true, spent: reward.cost, balance: balance - reward.cost };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function spendAdhoc(userId: string, amount: number, note: string): Promise<SpendResult> {
  const pool = await getQuestConnection();
  const tx = pool.transaction();
  await tx.begin();
  try {
    const balRow = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query<{ balance: number }>(
        `SELECT ISNULL(SUM(delta), 0) AS balance FROM quest_ledger WITH (UPDLOCK, HOLDLOCK) WHERE user_id = @userId`
      );
    const balance = balRow.recordset[0]?.balance ?? 0;
    if (balance < amount) {
      await tx.rollback();
      return { ok: false, reason: 'insufficient', balance };
    }

    await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('delta', sql.Decimal(10, 2), -amount)
      .input('reason', sql.NVarChar(500), note || 'Ad-hoc spend')
      .query(
        `INSERT INTO quest_ledger (user_id, delta, reason, ref_type, ref_id)
         VALUES (@userId, @delta, @reason, 'adhoc', NULL)`
      );

    await tx.commit();
    return { ok: true, spent: amount, balance: balance - amount };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}
