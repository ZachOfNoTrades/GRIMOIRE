import { getRuneConnection, closeRuneConnection } from './db';
import { Deck, DeckSummary } from '../types/deck';

export async function getAllDecks(): Promise<{ decks: DeckSummary[] }> {
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
      WHERE d.is_archived = 0
      GROUP BY d.id, d.name, d.description
      ORDER BY d.name
    `;

    const result = await pool.request().query(query);

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

export async function getDeckById(id: string): Promise<Deck> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('id', id)
      .query(`SELECT * FROM decks WHERE id = @id`);

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

export async function createDeck(name: string, description: string | null): Promise<Deck> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('name', name)
      .input('description', description)
      .query(`
        INSERT INTO decks (name, description)
        OUTPUT INSERTED.*
        VALUES (@name, @description)
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
