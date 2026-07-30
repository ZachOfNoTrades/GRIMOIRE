import sql from 'mssql';
import { getQuestConnection } from './db';
import { Debt } from '../types/debt';

export async function listDebts(userId: string): Promise<Debt[]> {
  const pool = await getQuestConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<Debt>(
      `SELECT id, user_id, name, amount_remaining, ts_created
       FROM quest_debts
       WHERE user_id = @userId
       ORDER BY ts_created ASC`
    );
  return result.recordset;
}

export async function createDebt(userId: string, name: string, amount: number): Promise<Debt> {
  const pool = await getQuestConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('name', sql.NVarChar(255), name)
    .input('amount', sql.Int, amount)
    .query<Debt>(
      `INSERT INTO quest_debts (user_id, name, amount_remaining)
       OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.name, INSERTED.amount_remaining, INSERTED.ts_created
       VALUES (@userId, @name, @amount)`
    );
  return result.recordset[0];
}

export async function deleteDebt(userId: string, debtId: string): Promise<boolean> {
  const pool = await getQuestConnection();
  const result = await pool.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('id', sql.UniqueIdentifier, debtId)
    .query(`DELETE FROM quest_debts WHERE id = @id AND user_id = @userId`);
  return (result.rowsAffected[0] ?? 0) > 0;
}

export type PayDebtResult =
  | { ok: true; paid: number; debt_remaining: number; balance: number; cleared: boolean }
  | { ok: false; reason: 'not_found' | 'no_balance' | 'already_paid'; balance: number };

// Apply whatever coins the user has against a debt. Sweeps min(balance, amount_remaining):
// inserts a negative ledger row capturing the amount paid (so reversals can read it back from
// transaction history) and decrements the debt row. If the payment empties the debt, the row
// is deleted so the UI stops showing it.
export async function payDebt(userId: string, debtId: string): Promise<PayDebtResult> {
  const pool = await getQuestConnection();
  const tx = pool.transaction();
  await tx.begin();
  try {
    const lookup = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('id', sql.UniqueIdentifier, debtId)
      .query<Debt>(
        `SELECT id, user_id, name, amount_remaining, ts_created
         FROM quest_debts WITH (UPDLOCK, HOLDLOCK)
         WHERE id = @id AND user_id = @userId`
      );
    const debt = lookup.recordset[0];
    if (!debt) {
      await tx.rollback();
      return { ok: false, reason: 'not_found', balance: 0 };
    }
    if (debt.amount_remaining <= 0) {
      await tx.rollback();
      return { ok: false, reason: 'already_paid', balance: 0 };
    }

    const balRow = await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query<{ balance: number }>(
        `SELECT ISNULL(SUM(delta), 0) AS balance FROM quest_ledger WITH (UPDLOCK, HOLDLOCK) WHERE user_id = @userId`
      );
    const balance = balRow.recordset[0]?.balance ?? 0;
    if (balance <= 0) {
      await tx.rollback();
      return { ok: false, reason: 'no_balance', balance };
    }

    const pay = Math.min(Math.floor(balance), debt.amount_remaining);
    const newRemaining = debt.amount_remaining - pay;

    await tx.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('delta', sql.Decimal(10, 2), -pay)
      .input('reason', sql.NVarChar(500), `Paid debt: ${debt.name}`)
      .input('refId', sql.UniqueIdentifier, debtId)
      .query(
        `INSERT INTO quest_ledger (user_id, delta, reason, ref_type, ref_id)
         VALUES (@userId, @delta, @reason, 'debt', @refId)`
      );

    let cleared = false;
    if (newRemaining <= 0) {
      // Debt fully paid — remove the row so it stops appearing in the list. The ledger row above
      // remains as the historical record of the payoff.
      await tx.request()
        .input('id', sql.UniqueIdentifier, debtId)
        .query(`DELETE FROM quest_debts WHERE id = @id`);
      cleared = true;
    } else {
      await tx.request()
        .input('id', sql.UniqueIdentifier, debtId)
        .input('remaining', sql.Int, newRemaining)
        .query(`UPDATE quest_debts SET amount_remaining = @remaining WHERE id = @id`);
    }

    await tx.commit();
    return { ok: true, paid: pay, debt_remaining: newRemaining, balance: balance - pay, cleared };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}
