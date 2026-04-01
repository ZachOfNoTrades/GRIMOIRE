import { getRuneConnection, closeRuneConnection } from './db';
import { CardWithProgress } from '../types/card';
import { GeneratedCard } from '../types/generation';

export async function getCardsByDeckId(userId: string, deckId: string): Promise<CardWithProgress[]> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('deckId', deckId)
      .query(`
        SELECT c.*, cp.ease_factor, cp.interval_days, cp.repetitions, cp.next_review_at, cp.last_reviewed_at
        FROM cards c
        LEFT JOIN card_progress cp ON cp.card_id = c.id
        WHERE c.deck_id = @deckId AND c.user_id = @userId
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

export async function getCardById(userId: string, id: string): Promise<CardWithProgress> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('id', id)
      .query(`
        SELECT c.*, cp.ease_factor, cp.interval_days, cp.repetitions, cp.next_review_at, cp.last_reviewed_at
        FROM cards c
        LEFT JOIN card_progress cp ON cp.card_id = c.id
        WHERE c.id = @id AND c.user_id = @userId
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

// Inserts a single card and returns it
export async function insertCard(userId: string, deckId: string, front: string, back: string, notes: string | null): Promise<CardWithProgress> {
  let pool;
  try {
    pool = await getRuneConnection();

    // Get next order_index
    const indexResult = await pool.request()
      .input('deckId', deckId)
      .query(`SELECT ISNULL(MAX(order_index), -1) + 1 AS next_index FROM cards WHERE deck_id = @deckId`);
    const nextIndex = indexResult.recordset[0].next_index;

    const result = await pool.request()
      .input('userId', userId)
      .input('deckId', deckId)
      .input('front', front.trim())
      .input('back', back.trim())
      .input('notes', notes?.trim() || null)
      .input('orderIndex', nextIndex)
      .query(`
        INSERT INTO cards (user_id, deck_id, front, back, notes, source, order_index)
        OUTPUT INSERTED.*
        VALUES (@userId, @deckId, @front, @back, @notes, 'manual', @orderIndex)
      `);

    // Return as CardWithProgress with null progress fields
    const card = result.recordset[0];
    return {
      ...card,
      ease_factor: null,
      interval_days: null,
      repetitions: null,
      next_review_at: null,
      last_reviewed_at: null,
    } as CardWithProgress;
  } catch (error) {
    console.error('Error inserting card:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

// Inserts multiple cards into a deck in a single transaction. Returns the number of cards inserted.
export async function insertCards(userId: string, deckId: string, cards: GeneratedCard[], source: string = 'notion'): Promise<number> {
  let pool;
  try {
    pool = await getRuneConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      for (const card of cards) {
        await transaction.request()
          .input('userId', userId)
          .input('deckId', deckId)
          .input('front', card.front.trim())
          .input('back', card.back.trim())
          .input('notes', card.notes?.trim() || null)
          .input('source', source)
          .input('orderIndex', card.order_index)
          .query(`
            INSERT INTO cards (user_id, deck_id, front, back, notes, source, order_index)
            VALUES (@userId, @deckId, @front, @back, @notes, @source, @orderIndex)
          `);
      }

      await transaction.commit();
      return cards.length;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error inserting cards:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}
