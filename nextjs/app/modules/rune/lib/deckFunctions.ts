import sql from 'mssql';
import { getRuneConnection, closeRuneConnection } from './db';
import { Deck, DeckSummary } from '../types/deck';

export async function getAllDecks(userId: string): Promise<{ decks: DeckSummary[] }> {
  let pool;
  try {
    pool = await getRuneConnection();

    // Active decks first, then favorites, then alphabetical — the client can re-sort, but this
    // keeps the default (and any no-JS render) sensible with pinned decks on top and paused
    // decks out of the way at the bottom.
    const query = `
      SELECT
        d.id, d.name, d.description, d.is_favorite, d.is_disabled,
        COUNT(c.id) AS card_count,
        -- Draft cards still count toward card_count but are never "due" — they're excluded from study.
        -- A blank back is NOT a reason to hold a card back: an answerless card is a legitimate
        -- self-graded card and studies like any other.
        -- A disabled deck keeps its card_count but reports 0 due: it's paused, so nothing in it is
        -- scheduled. This is the same predicate the badge and the digest use, so they can't disagree.
        COUNT(CASE WHEN c.id IS NOT NULL AND d.is_disabled = 0 AND c.is_draft = 0 AND (cp.next_review_at IS NULL OR cp.next_review_at <= GETDATE()) THEN 1 END) AS due_count,
        MAX(cp.last_reviewed_at) AS last_reviewed_at
      FROM decks d
      LEFT JOIN cards c ON c.deck_id = d.id AND c.is_disabled = 0
      LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = @userId
      WHERE d.is_archived = 0 AND d.user_id = @userId
      GROUP BY d.id, d.name, d.description, d.is_favorite, d.is_disabled
      ORDER BY d.is_disabled, d.is_favorite DESC, d.name
    `;

    const result = await pool.request()
      .input('userId', userId)
      .query(query);

    if (result.recordset.length === 0) {
      console.warn('No decks found');
    }

    // Coerce the BITs to real booleans so the client's star/sort logic is clean.
    const decks = result.recordset.map((row) => ({
      ...row,
      is_favorite: !!row.is_favorite,
      is_disabled: !!row.is_disabled,
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

// `userId` is the deck's OWNER (the ownership scope); `progressUserId` is whose study
// progress last_reviewed_at is read from — the caller, which differs on a shared deck.
export async function getDeckById(userId: string, id: string, progressUserId: string = userId): Promise<Deck> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('progressUserId', progressUserId)
      .input('id', id)
      .query(`
        SELECT d.*, MAX(cp.last_reviewed_at) AS last_reviewed_at
        FROM decks d
        LEFT JOIN cards c ON c.deck_id = d.id AND c.is_disabled = 0
        LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = @progressUserId
        WHERE d.id = @id AND d.user_id = @userId
        GROUP BY d.id, d.name, d.description, d.source_url, d.is_archived, d.is_disabled, d.is_favorite, d.user_id, d.created_at, d.modified_at
      `);

    if (result.recordset.length === 0) {
      throw new Error(`No deck found for id: '${id}'`);
    }

    // Coerce the BIT so the deck page can test it without truthiness surprises.
    return { ...result.recordset[0], is_disabled: !!result.recordset[0].is_disabled } as Deck;
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
      // Ownership first, inside the transaction. The deletes below reach OTHER users' rows —
      // sharees' reviews, progress and study sessions on this deck's cards — so nothing may
      // run for a deck the caller doesn't own (the MCP tool calls this without a route check).
      const owned = await transaction.request()
        .input('userId', userId)
        .input('deckId', deckId)
        .query(`SELECT 1 AS ok FROM decks WHERE id = @deckId AND user_id = @userId`);
      if (owned.recordset.length === 0) {
        throw new Error(`No deck found for id: '${deckId}'`);
      }

      // Delete card reviews for cards in this deck (every user's — the deck may be shared)
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

      // Delete study sessions for this deck — sharees' too, or FK_study_sessions_deck blocks
      // the deck delete. Their reviews in those sessions were all on this deck's cards and
      // are already gone above.
      await transaction.request()
        .input('deckId', deckId)
        .query(`DELETE FROM study_sessions WHERE deck_id = @deckId`);

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

// Pause / resume a deck. Disabling never touches the deck's cards or their progress — the
// schedule is preserved exactly as it was, so re-enabling brings back whatever became due
// in the meantime rather than resetting anything.
export async function setDeckDisabled(userId: string, deckId: string, isDisabled: boolean): Promise<void> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('deckId', deckId)
      .input('disabled', sql.Bit, isDisabled ? 1 : 0)
      .query(`
        UPDATE decks
        SET is_disabled = @disabled, modified_at = GETDATE()
        WHERE id = @deckId AND user_id = @userId
      `);

    if (result.rowsAffected[0] === 0) {
      throw new Error(`No deck found for id: '${deckId}'`);
    }
  } catch (error) {
    console.error('Error updating deck disabled state:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}
