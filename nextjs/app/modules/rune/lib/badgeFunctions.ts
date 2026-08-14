import sql from 'mssql';
import { ModuleBadge } from '@/types/dashboardBadge';
import { getRuneConnection } from './db';

// Homepage badge for the Rune card: how many cards are due for review right now.
// The due predicate is deliberately identical to getAllDecks' due_count (non-archived,
// non-disabled decks, enabled non-draft cards, never-reviewed cards count as due) so the badge
// and the deck list can never disagree — a card the badge counts is always one the study session
// will serve.

export async function getRuneBadges(userId: string): Promise<ModuleBadge[]> {
  const pool = await getRuneConnection();
  const res = await pool
    .request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query<{ due_count: number }>(
      `SELECT COUNT(*) AS due_count
       FROM cards c
       JOIN decks d ON d.id = c.deck_id AND d.is_archived = 0 AND d.is_disabled = 0 AND d.user_id = @userId
       LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = @userId
       WHERE c.user_id = @userId
         AND c.is_disabled = 0
         AND c.is_draft = 0
         AND (cp.next_review_at IS NULL OR cp.next_review_at <= GETDATE())`
    );

  const dueCount = Number(res.recordset[0]?.due_count ?? 0);
  if (dueCount === 0) return [];

  return [
    {
      key: 'rune-due',
      label: `${dueCount} due`,
      tone: 'blue',
      detail: `${dueCount} card${dueCount === 1 ? '' : 's'} ready to review.`,
    },
  ];
}
