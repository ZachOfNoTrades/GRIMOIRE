import sql from 'mssql';
import { getRuneConnection, closeRuneConnection } from './db';
import { Collection, CollectionSummary, CollectionWithDecks } from '../types/collection';
import { DeckSummary } from '../types/deck';
import { CardWithProgress } from '../types/card';

// Membership rows are inserted with an explicit ownership check rather than a blind
// INSERT: a deck id the caller doesn't own simply produces no row instead of linking
// someone else's deck into their collection.
async function replaceCollectionDecks(
  transaction: sql.Transaction,
  collectionId: string,
  userId: string,
  deckIds: string[],
): Promise<void> {
  await transaction.request()
    .input('collectionId', collectionId)
    .query(`DELETE FROM collection_decks WHERE collection_id = @collectionId`);

  for (let index = 0; index < deckIds.length; index++) {
    await transaction.request()
      .input('collectionId', collectionId)
      .input('deckId', deckIds[index])
      .input('userId', userId)
      .input('orderIndex', index)
      .query(`
        INSERT INTO collection_decks (collection_id, deck_id, order_index)
        SELECT @collectionId, d.id, @orderIndex
        FROM decks d
        WHERE d.id = @deckId AND d.user_id = @userId
      `);
  }
}

export async function getAllCollections(userId: string): Promise<{ collections: CollectionSummary[] }> {
  let pool;
  try {
    pool = await getRuneConnection();

    // Counts roll up every live member deck, so the list shows what a collection-wide
    // study session would actually pull. Draft cards count toward card_count but are
    // never "due" — same rule the deck list uses.
    const result = await pool.request()
      .input('userId', userId)
      .query(`
        SELECT
          co.id, co.name, co.description,
          COUNT(DISTINCT d.id) AS deck_count,
          COUNT(c.id) AS card_count,
          COUNT(CASE WHEN c.id IS NOT NULL AND c.is_draft = 0 AND (cp.next_review_at IS NULL OR cp.next_review_at <= GETDATE()) THEN 1 END) AS due_count,
          MAX(cp.last_reviewed_at) AS last_reviewed_at
        FROM collections co
        LEFT JOIN collection_decks cd ON cd.collection_id = co.id
        LEFT JOIN decks d ON d.id = cd.deck_id AND d.is_archived = 0 AND d.user_id = @userId
        LEFT JOIN cards c ON c.deck_id = d.id AND c.is_disabled = 0
        LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = @userId
        WHERE co.user_id = @userId
        GROUP BY co.id, co.name, co.description
        ORDER BY co.name
      `);

    if (result.recordset.length === 0) {
      console.warn(`No collections found for user id: '${userId}'`);
    }

    return { collections: result.recordset as CollectionSummary[] };
  } catch (error) {
    console.error('Error fetching collections:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

export async function getCollectionById(userId: string, id: string): Promise<CollectionWithDecks> {
  let pool;
  try {
    pool = await getRuneConnection();

    const collectionResult = await pool.request()
      .input('userId', userId)
      .input('id', id)
      .query(`
        SELECT
          co.id, co.name, co.description,
          COUNT(DISTINCT d.id) AS deck_count,
          COUNT(c.id) AS card_count,
          COUNT(CASE WHEN c.id IS NOT NULL AND c.is_draft = 0 AND (cp.next_review_at IS NULL OR cp.next_review_at <= GETDATE()) THEN 1 END) AS due_count,
          MAX(cp.last_reviewed_at) AS last_reviewed_at
        FROM collections co
        LEFT JOIN collection_decks cd ON cd.collection_id = co.id
        LEFT JOIN decks d ON d.id = cd.deck_id AND d.is_archived = 0 AND d.user_id = @userId
        LEFT JOIN cards c ON c.deck_id = d.id AND c.is_disabled = 0
        LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = @userId
        WHERE co.id = @id AND co.user_id = @userId
        GROUP BY co.id, co.name, co.description
      `);

    if (collectionResult.recordset.length === 0) {
      throw new Error(`No collection found for id: '${id}'`);
    }

    // Member decks carry the same summary shape the deck list uses, so the detail
    // page can show per-deck due counts without a second round of endpoints.
    const decksResult = await pool.request()
      .input('userId', userId)
      .input('id', id)
      .query(`
        SELECT
          d.id, d.name, d.description, d.is_favorite,
          COUNT(c.id) AS card_count,
          COUNT(CASE WHEN c.id IS NOT NULL AND c.is_draft = 0 AND (cp.next_review_at IS NULL OR cp.next_review_at <= GETDATE()) THEN 1 END) AS due_count,
          MAX(cp.last_reviewed_at) AS last_reviewed_at
        FROM collection_decks cd
        INNER JOIN decks d ON d.id = cd.deck_id AND d.is_archived = 0 AND d.user_id = @userId
        LEFT JOIN cards c ON c.deck_id = d.id AND c.is_disabled = 0
        LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = @userId
        WHERE cd.collection_id = @id
        GROUP BY d.id, d.name, d.description, d.is_favorite, cd.order_index
        ORDER BY cd.order_index, d.name
      `);

    const decks = decksResult.recordset.map((row) => ({
      ...row,
      is_favorite: !!row.is_favorite,
    })) as DeckSummary[];

    return { ...(collectionResult.recordset[0] as CollectionSummary), decks };
  } catch (error) {
    console.error('Error fetching collection:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

// Every card across the collection's decks, with the same progress fields the
// per-deck card fetch returns — the collection study session filters/shuffles it
// exactly like a single deck's card list. The owning deck's name rides along
// (deck_name): a collection session spans several decks, so the study UI has to
// be able to say which deck the card on screen came from. The per-deck fetch
// leaves it undefined — there the session header already names the deck.
export async function getCollectionCards(userId: string, id: string): Promise<CardWithProgress[]> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('id', id)
      .query(`
        SELECT c.*, cp.ease_factor, cp.interval_days, cp.repetitions, cp.next_review_at, cp.last_reviewed_at,
          d.name AS deck_name,
          (SELECT TOP 1 cr.rating FROM card_reviews cr WHERE cr.card_id = c.id ORDER BY cr.created_at DESC) AS last_rating
        FROM collection_decks cd
        INNER JOIN decks d ON d.id = cd.deck_id AND d.is_archived = 0 AND d.user_id = @userId
        INNER JOIN cards c ON c.deck_id = d.id AND c.user_id = @userId
        LEFT JOIN card_progress cp ON cp.card_id = c.id
        WHERE cd.collection_id = @id
        ORDER BY cd.order_index, c.order_index
      `);

    if (result.recordset.length === 0) {
      console.warn(`No cards found for collection id: '${id}'`);
    }

    return result.recordset as CardWithProgress[];
  } catch (error) {
    console.error('Error fetching collection cards:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

export async function createCollection(
  userId: string,
  name: string,
  description: string | null,
  deckIds: string[],
): Promise<Collection> {
  let pool;
  try {
    pool = await getRuneConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      const result = await transaction.request()
        .input('userId', userId)
        .input('name', name)
        .input('description', description)
        .query(`
          INSERT INTO collections (user_id, name, description)
          OUTPUT INSERTED.*
          VALUES (@userId, @name, @description)
        `);

      const collection = result.recordset[0] as Collection;

      await replaceCollectionDecks(transaction, collection.id, userId, deckIds);

      await transaction.commit();
      return collection;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error creating collection:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

// deckIds omitted (undefined) means "leave membership alone" — a plain rename
// shouldn't have to resend the whole deck list.
export async function updateCollection(
  userId: string,
  collectionId: string,
  name: string,
  description: string | null,
  deckIds?: string[],
): Promise<void> {
  let pool;
  try {
    pool = await getRuneConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      const result = await transaction.request()
        .input('userId', userId)
        .input('collectionId', collectionId)
        .input('name', name)
        .input('description', description)
        .query(`
          UPDATE collections
          SET name = @name, description = @description, modified_at = GETDATE()
          WHERE id = @collectionId AND user_id = @userId
        `);

      if (result.rowsAffected[0] === 0) {
        throw new Error(`No collection found for id: '${collectionId}'`);
      }

      if (deckIds) {
        await replaceCollectionDecks(transaction, collectionId, userId, deckIds);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error updating collection:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

// Deleting a collection drops its membership rows but keeps the study sessions it
// produced — those carry real review history, so they're just unlinked (collection_id
// set to NULL) rather than deleted.
export async function deleteCollection(userId: string, collectionId: string): Promise<void> {
  let pool;
  try {
    pool = await getRuneConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      await transaction.request()
        .input('collectionId', collectionId)
        .query(`DELETE FROM collection_decks WHERE collection_id = @collectionId`);

      await transaction.request()
        .input('userId', userId)
        .input('collectionId', collectionId)
        .query(`
          UPDATE study_sessions
          SET collection_id = NULL
          WHERE collection_id = @collectionId AND user_id = @userId
        `);

      const result = await transaction.request()
        .input('userId', userId)
        .input('collectionId', collectionId)
        .query(`DELETE FROM collections WHERE id = @collectionId AND user_id = @userId`);

      if (result.rowsAffected[0] === 0) {
        throw new Error(`No collection found for id: '${collectionId}'`);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error deleting collection:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}
