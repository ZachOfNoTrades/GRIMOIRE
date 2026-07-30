// The write half of the unsubscribe flow: turning off the per-user notification flags that an
// unsubscribe token names. Split from lib/emailUnsubscribe (which stays DB-free) so that
// lib/email can import the link builders without dragging every module's database connection —
// and its notification code, which imports lib/email — into the graph behind it.

import sql from 'mssql';
import { getQuestConnection } from '@/app/modules/quest/lib/db';
import { getRuneConnection } from '@/app/modules/rune/lib/db';
import { getFoodConnection, closeFoodConnection } from '@/app/modules/forage/lib/db';
import type { UnsubscribeTarget } from '@/lib/emailUnsubscribe';

// ---------------------------------------------------------------- apply

// Each kind maps to the single per-user flag that gates it, in that module's own database.
// Rows are only ever updated — a user with no settings row has never enabled the notification,
// so there is nothing to turn off.
async function disableQuestFlag(userId: string, column: 'digest_enabled' | 'bonus_notif_enabled' | 'reminders_enabled'): Promise<void> {
  const pool = await getQuestConnection();
  await pool
    .request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`UPDATE dbo.quest_settings SET ${column} = 0 WHERE user_id = @userId`);
}

async function disableRuneDigest(userId: string): Promise<void> {
  const pool = await getRuneConnection();
  await pool
    .request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`UPDATE dbo.rune_settings SET digest_enabled = 0 WHERE user_id = @userId`);
}

async function disableForageCheckin(userId: string): Promise<void> {
  let pool;
  try {
    pool = await getFoodConnection();
    await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`UPDATE dbo.forage_user_settings SET checkin_notif_enabled = 0 WHERE user_id = @userId`);
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Turns off the notification(s) the token names. Idempotent — unsubscribing twice is a no-op,
// which matters because mail clients pre-fetch links.
export async function applyUnsubscribe(userId: string, kind: UnsubscribeTarget): Promise<void> {
  switch (kind) {
    case 'quest-digest':
      return disableQuestFlag(userId, 'digest_enabled');
    case 'quest-bonus':
      return disableQuestFlag(userId, 'bonus_notif_enabled');
    case 'quest-reminder':
      return disableQuestFlag(userId, 'reminders_enabled');
    case 'rune-digest':
      return disableRuneDigest(userId);
    case 'forage-checkin':
      return disableForageCheckin(userId);
    case 'all': {
      // Best-effort across every module: one module's DB being down shouldn't leave the user
      // still subscribed to the others.
      const results = await Promise.allSettled([
        disableQuestFlag(userId, 'digest_enabled'),
        disableQuestFlag(userId, 'bonus_notif_enabled'),
        disableQuestFlag(userId, 'reminders_enabled'),
        disableRuneDigest(userId),
        disableForageCheckin(userId),
      ]);
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length === results.length) {
        throw new Error('Failed to unsubscribe from any notification');
      }
      for (const f of failed) {
        console.warn('Partial unsubscribe failure:', (f as PromiseRejectedResult).reason);
      }
      return;
    }
  }
}
