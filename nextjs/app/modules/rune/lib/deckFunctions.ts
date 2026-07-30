import sql from 'mssql';
import { getRuneConnection, closeRuneConnection } from './db';
import { Deck, DeckSummary } from '../types/deck';

export async function getAllDecks(userId: string): Promise<{ decks: DeckSummary[] }> {
  let pool;
  try {
    pool = await getRuneConnection();

    // Favorites first, then alphabetical — the client can re-sort, but this keeps
    // the default (and any no-JS render) sensible with pinned decks on top.
    const query = `
      SELECT
        d.id, d.name, d.description, d.is_favorite,
        COUNT(c.id) AS card_count,
        -- Draft cards still count toward card_count but are never "due" — they're excluded from study.
        COUNT(CASE WHEN c.id IS NOT NULL AND c.is_draft = 0 AND (cp.next_review_at IS NULL OR cp.next_review_at <= GETDATE()) THEN 1 END) AS due_count,
        MAX(cp.last_reviewed_at) AS last_reviewed_at
      FROM decks d
      LEFT JOIN cards c ON c.deck_id = d.id AND c.is_disabled = 0
      LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = @userId
      WHERE d.is_archived = 0 AND d.user_id = @userId
      GROUP BY d.id, d.name, d.description, d.is_favorite
      ORDER BY d.is_favorite DESC, d.name
    `;

    const result = await pool.request()
      .input('userId', userId)
      .query(query);

    if (result.recordset.length === 0) {
      console.warn('No decks found');
    }

    // Coerce the BIT to a real boolean so the client's star/sort logic is clean.
    const decks = result.recordset.map((row) => ({
      ...row,
      is_favorite: !!row.is_favorite,
    })) as DeckSummary[];

    return { decks };
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
        GROUP BY d.id, d.name, d.description, d.source_url, d.is_archived, d.is_favorite, d.user_id, d.created_at, d.modified_at
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

export async function updateDeck(userId: string, deckId: string, name: string, description: string | null, sourceUrl: string | null): Promise<void> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('deckId', deckId)
      .input('name', name)
      .input('description', description)
      .input('sourceUrl', sourceUrl)
      .query(`
        UPDATE decks
        SET name = @name, description = @description, source_url = @sourceUrl, modified_at = GETDATE()
        WHERE id = @deckId AND user_id = @userId
      `);

    if (result.rowsAffected[0] === 0) {
      throw new Error(`No deck found for id: '${deckId}'`);
    }
  } catch (error) {
    console.error('Error updating deck:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

export async function createDeck(userId: string, name: string, description: string | null, sourceUrl: string | null = null): Promise<Deck> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('name', name)
      .input('description', description)
      .input('sourceUrl', sourceUrl)
      .query(`
        INSERT INTO decks (user_id, name, description, source_url)
        OUTPUT INSERTED.*
        VALUES (@userId, @name, @description, @sourceUrl)
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

export async function setDeckFavorite(userId: string, deckId: string, isFavorite: boolean): Promise<void> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('deckId', deckId)
      .input('fav', sql.Bit, isFavorite ? 1 : 0)
      .query(`
        UPDATE decks
        SET is_favorite = @fav, modified_at = GETDATE()
        WHERE id = @deckId AND user_id = @userId
      `);

    if (result.rowsAffected[0] === 0) {
      throw new Error(`No deck found for id: '${deckId}'`);
    }
  } catch (error) {
    console.error('Error updating deck favorite:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}
