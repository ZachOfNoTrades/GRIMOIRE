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
        COUNT(CASE WHEN cp.next_review_at <= GETDATE() THEN 1 END) AS due_count
      FROM decks d
      LEFT JOIN cards c ON c.deck_id = d.id AND c.is_disabled = 0
      LEFT JOIN card_progress cp ON cp.card_id = c.id
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
      .query(`SELECT * FROM decks WHERE id = @id AND user_id = @userId`);

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
