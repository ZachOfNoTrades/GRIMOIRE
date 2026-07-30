// Resolves a user's email + display name from the MAIN database.
//
// Every notification now goes to the recipient's own address rather than a shared Discord
// channel, so each sender needs a per-user email. Some callers already have one to hand (the
// schedulers join it while picking candidates); the rest — manual debug triggers, quest task
// reminders, the forage check-in — do not. This is the single lookup they all fall back to,
// which keeps the cross-DB join in JS: module rows live in their own database and the MAIN DB
// name is env-configurable, so three-part-name joins aren't an option.

import sql from 'mssql';
import { getMainConnection } from '@/lib/db';

export interface UserContact {
  email: string;
  name: string | null;
}

export async function getUserContact(userId: string): Promise<UserContact | null> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<{ email: string; name: string | null }>(
      `SELECT email, name FROM dbo.users WHERE id = @userId`,
    );
  if (result.recordset.length === 0) {
    console.warn(`No user found for id: '${userId}'`);
    return null;
  }
  return { email: result.recordset[0].email, name: result.recordset[0].name };
}
