import sql from 'mssql';
import { getQuestConnection } from './db';
import { LedgerEntry } from '../types/ledger';

export async function getBalance(userId: string): Promise<number> {
  const pool = await getQuestConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<{ balance: number }>(
      `SELECT ISNULL(SUM(delta), 0) AS balance FROM quest_ledger WHERE user_id = @userId`
    );
  return result.recordset[0]?.balance ?? 0;
}

export async function getLedger(userId: string, limit = 50): Promise<LedgerEntry[]> {
  const pool = await getQuestConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('limit', sql.Int, limit)
    .query<LedgerEntry>(
      `SELECT TOP (@limit) id, user_id, delta, reason, ref_type, ref_id, ts_created
       FROM quest_ledger
       WHERE user_id = @userId
       ORDER BY ts_created DESC`
    );
  return result.recordset;
}

export async function appendLedger(
  request: sql.Request,
  userId: string,
  delta: number,
  reason: string,
  refType: 'task' | 'reward' | 'adhoc' | null,
  refId: string | null,
): Promise<void> {
  await request
    .input('lUserId', sql.UniqueIdentifier, userId)
    .input('lDelta', sql.Decimal(10, 2), delta)
    .input('lReason', sql.NVarChar(500), reason)
    .input('lRefType', sql.NVarChar(20), refType)
    .input('lRefId', sql.UniqueIdentifier, refId)
    .query(
      `INSERT INTO quest_ledger (user_id, delta, reason, ref_type, ref_id)
       VALUES (@lUserId, @lDelta, @lReason, @lRefType, @lRefId)`
    );
}
