import { getRuneConnection, closeRuneConnection } from './db';
import { Deck, DeckSummary } from '../types/deck';

export async function getAllDecks(userId: string): Promise<{ decks: DeckSummary[] }> {
  let pool;
  try {
    pool = await getRuneConnection();

    const query = `
      SELECT
        d.id, d.name, d.description,
        COUNT(c.id) AS card_count,
        COUNT(CASE WHEN cp.next_review_at IS NULL OR cp.next_review_at <= GETDATE() THEN 1 END) AS due_count,
        MAX(cp.last_reviewed_at) AS last_reviewed_at
      FROM decks d
      LEFT JOIN cards c ON c.deck_id = d.id AND c.is_disabled = 0
      LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = @userId
      WHERE d.is_archived = 0 AND d.user_id = @userId
      GROUP BY d.id, d.name, d.description
      ORDER BY d.name
    `;

    const result = await pool.request()
      .input('userId', userId)
      .query(query);

    if (result.recordset.length === 0) {
      console.warn('No decks found');
    }

    return { decks: result.recordset as DeckSummary[] };
  } catch (error) {
    console.error('Error fetching decks:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

export async function getDeckById(userId: string, id: string): Promise<Deck> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('id', id)
      .query(`
        SELECT d.*, MAX(cp.last_reviewed_at) AS last_reviewed_at
        FROM decks d
        LEFT JOIN cards c ON c.deck_id = d.id AND c.is_disabled = 0
        LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = @userId
        WHERE d.id = @id AND d.user_id = @userId
        GROUP BY d.id, d.name, d.description, d.is_archived, d.user_id, d.created_at, d.modified_at
      `);

    if (result.recordset.length === 0) {
      throw new Error(`No deck found for id: '${id}'`);
    }

    return result.recordset[0] as Deck;
  } catch (error) {
    console.error('Error fetching deck:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

export async function deleteDeck(userId: string, deckId: string): Promise<void> {
  let pool;
  try {
    pool = await getRuneConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Delete card reviews for cards in this deck
      await transaction.request()
        .input('userId', userId)
        .input('deckId', deckId)
        .query(`
          DELETE cr FROM card_reviews cr
          INNER JOIN cards c ON c.id = cr.card_id
          WHERE c.deck_id = @deckId AND c.user_id = @userId
        `);

      // Delete card progress for cards in this deck
      await transaction.request()
        .input('userId', userId)
        .input('deckId', deckId)
        .query(`
          DELETE cp FROM card_progress cp
          INNER JOIN cards c ON c.id = cp.card_id
          WHERE c.deck_id = @deckId AND c.user_id = @userId
        `);

      // Delete study sessions for this deck
      await transaction.request()
        .input('userId', userId)
        .input('deckId', deckId)
        .query(`DELETE FROM study_sessions WHERE deck_id = @deckId AND user_id = @userId`);

      // Delete cards in this deck
      await transaction.request()
        .input('userId', userId)
        .input('deckId', deckId)
        .query(`DELETE FROM cards WHERE deck_id = @deckId AND user_id = @userId`);

      // Delete the deck
      await transaction.request()
        .input('userId', userId)
        .input('deckId', deckId)
        .query(`DELETE FROM decks WHERE id = @deckId AND user_id = @userId`);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error deleting deck:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

export async function createDeck(userId: string, name: string, description: string | null): Promise<Deck> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('name', name)
      .input('description', description)
      .query(`
        INSERT INTO decks (user_id, name, description)
        OUTPUT INSERTED.*
        VALUES (@userId, @name, @description)
      `);

    return result.recordset[0] as Deck;
  } catch (error) {
    console.error('Error creating deck:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}
