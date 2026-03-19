import { getRuneConnection, closeRuneConnection } from './db';
import { CardWithProgress } from '../types/card';

export async function getCardsByDeckId(deckId: string): Promise<CardWithProgress[]> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('deckId', deckId)
      .query(`
        SELECT c.*, cp.ease_factor, cp.interval_days, cp.repetitions, cp.next_review_at, cp.last_reviewed_at
        FROM cards c
        LEFT JOIN card_progress cp ON cp.card_id = c.id
        WHERE c.deck_id = @deckId
        ORDER BY c.order_index
      `);

    if (result.recordset.length === 0) {
      console.warn(`No cards found for deck id: '${deckId}'`);
    }

    return result.recordset as CardWithProgress[];
  } catch (error) {
    console.error('Error fetching cards:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

export async function getCardById(id: string): Promise<CardWithProgress> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('id', id)
      .query(`
        SELECT c.*, cp.ease_factor, cp.interval_days, cp.repetitions, cp.next_review_at, cp.last_reviewed_at
        FROM cards c
        LEFT JOIN card_progress cp ON cp.card_id = c.id
        WHERE c.id = @id
      `);

    if (result.recordset.length === 0) {
      throw new Error(`No card found for id: '${id}'`);
    }

    return result.recordset[0] as CardWithProgress;
  } catch (error) {
    console.error('Error fetching card:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}
