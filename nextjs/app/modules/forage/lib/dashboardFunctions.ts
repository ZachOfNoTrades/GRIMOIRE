import sql from 'mssql';
import { getFoodConnection, closeFoodConnection } from './db';
import { listNutrients } from './nutrientFunctions';
import {
  DashboardSection,
  MACRO_CARD_KEYS,
  DEFAULT_DASHBOARD_CARDS,
} from '../types/dashboard';

// Hard cap on cards per section — guards against a malformed PUT writing an
// unbounded list. Far above any sane dashboard.
const MAX_CARDS = 64;

// The set of card keys a user is allowed to place: the synthetic macro keys plus
// every active nutrient code. Anything else (stale code, typo) is dropped on save
// and skipped on read so the dashboard never tries to render an unknown card.
async function validCardKeys(): Promise<Set<string>> {
  const nutrients = await listNutrients();
  return new Set<string>([...MACRO_CARD_KEYS, ...nutrients.map((n) => n.code)]);
}

// Ordered card keys for a section. Empty config (no rows) → the section's default
// set, so users who have never customized keep the original layout. Unknown keys
// are filtered so a removed nutrient can't break the dashboard.
export async function getDashboardCards(
  userId: string,
  section: DashboardSection,
): Promise<string[]> {
  let pool;
  try {
    pool = await getFoodConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('section', sql.VarChar(32), section)
      .query<{ card_key: string }>(
        `SELECT card_key
         FROM forage_dashboard_cards
         WHERE user_id = @userId AND section = @section
         ORDER BY position ASC`
      );

    if (result.recordset.length === 0) {
      return [...(DEFAULT_DASHBOARD_CARDS[section] ?? [])];
    }

    const allowed = await validCardKeys();
    return result.recordset.map((r) => r.card_key).filter((k) => allowed.has(k));
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}

// Replace a section's card config wholesale. Unknown/duplicate keys are dropped
// and order is taken from the incoming array. Done in a transaction so a save is
// all-or-nothing (the dashboard never reads a half-written layout).
export async function setDashboardCards(
  userId: string,
  section: DashboardSection,
  cardKeys: string[],
): Promise<string[]> {
  const allowed = await validCardKeys();

  // Dedupe while preserving order, drop unknowns, cap length.
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const key of cardKeys) {
    if (typeof key !== 'string') continue;
    if (!allowed.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(key);
    if (cleaned.length >= MAX_CARDS) break;
  }

  let pool;
  try {
    pool = await getFoodConnection();
    const tx = pool.transaction();
    await tx.begin();
    try {
      await tx
        .request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('section', sql.VarChar(32), section)
        .query(
          `DELETE FROM forage_dashboard_cards WHERE user_id = @userId AND section = @section`
        );

      for (let i = 0; i < cleaned.length; i++) {
        await tx
          .request()
          .input('userId', sql.UniqueIdentifier, userId)
          .input('section', sql.VarChar(32), section)
          .input('cardKey', sql.NVarChar(64), cleaned[i])
          .input('position', sql.Int, i)
          .query(
            `INSERT INTO forage_dashboard_cards (user_id, section, card_key, position)
             VALUES (@userId, @section, @cardKey, @position)`
          );
      }

      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }

    return cleaned;
  } finally {
    if (pool) await closeFoodConnection(pool);
  }
}
