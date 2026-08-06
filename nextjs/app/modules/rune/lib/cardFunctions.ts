import { getRuneConnection, closeRuneConnection } from './db';
import { CardWithProgress, CardReview } from '../types/card';
import { GeneratedCard, RefinedCard } from '../types/generation';

export async function getCardsByDeckId(userId: string, deckId: string): Promise<CardWithProgress[]> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('deckId', deckId)
      .query(`
        SELECT c.*, cp.ease_factor, cp.interval_days, cp.repetitions, cp.next_review_at, cp.last_reviewed_at,
          (SELECT TOP 1 cr.rating FROM card_reviews cr WHERE cr.card_id = c.id ORDER BY cr.created_at DESC) AS last_rating
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
        SELECT c.*, cp.ease_factor, cp.interval_days, cp.repetitions, cp.next_review_at, cp.last_reviewed_at,
          (SELECT TOP 1 cr.rating FROM card_reviews cr WHERE cr.card_id = c.id ORDER BY cr.created_at DESC) AS last_rating
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

// Every rating ever submitted for one card, newest first. The card row itself
// only carries the latest rating + the current SRS state — this is the raw log
// behind it, so a card's difficulty over time can be read directly.
export async function getCardReviewHistory(userId: string, cardId: string): Promise<CardReview[]> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('cardId', cardId)
      .query(`
        SELECT cr.id, cr.rating, cr.response_time_ms, cr.created_at, cr.study_session_id
        FROM card_reviews cr
        WHERE cr.card_id = @cardId AND cr.user_id = @userId
        ORDER BY cr.created_at DESC
      `);

    if (result.recordset.length === 0) {
      console.warn(`No card reviews found for card id: '${cardId}'`);
    }

    return result.recordset as CardReview[];
  } catch (error) {
    console.error('Error fetching card review history:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

// Deletes a card and its associated progress and reviews
export async function deleteCard(userId: string, cardId: string): Promise<void> {
  let pool;
  try {
    pool = await getRuneConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Delete card reviews
      await transaction.request()
        .input('cardId', cardId)
        .query(`DELETE FROM card_reviews WHERE card_id = @cardId`);

      // Delete card progress
      await transaction.request()
        .input('cardId', cardId)
        .query(`DELETE FROM card_progress WHERE card_id = @cardId`);

      // Delete card
      const result = await transaction.request()
        .input('userId', userId)
        .input('cardId', cardId)
        .query(`
          DELETE FROM cards
          WHERE id = @cardId AND user_id = @userId -- user_id check is a safety net; ownership is enforced at the API layer
        `);

      if (result.rowsAffected[0] === 0) {
        throw new Error(`No card found for id: '${cardId}'`);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error deleting card:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

// Inserts a single card and returns it
export async function insertCard(userId: string, deckId: string, front: string, back: string, notes: string | null, category: string | null = null, isDraft: boolean = false): Promise<CardWithProgress> {
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
      .input('category', category?.trim() || null)
      .input('isDraft', isDraft ? 1 : 0)
      .input('orderIndex', nextIndex)
      .query(`
        INSERT INTO cards (user_id, deck_id, front, back, notes, category, is_draft, source, order_index)
        OUTPUT INSERTED.*
        VALUES (@userId, @deckId, @front, @back, @notes, @category, @isDraft, 'manual', @orderIndex)
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
      last_rating: null,
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

// Updates a card's front, back, and notes fields. `category` is a separate optional
// param rather than folded into a single object: passing it as `undefined` (the
// default) leaves the existing category untouched — refineFunctions.ts's LLM refine
// path only ever touches front/back/notes and must not silently wipe out a
// previously-assigned category. Pass `null` explicitly to clear it, or a string to set it.
// `isDraft` is tri-state like `category`: omit (undefined) to leave the card's draft
// flag untouched, or pass a boolean to set it. Draft cards are hidden from study and
// excluded from the due count — see getAllDecks and the study filter in the deck page.
export async function updateCard(userId: string, cardId: string, front: string, back: string, notes: string | null, category?: string | null, isDraft?: boolean): Promise<void> {
  let pool;
  try {
    pool = await getRuneConnection();
    const request = pool.request()
      .input('userId', userId)
      .input('cardId', cardId)
      .input('front', front.trim())
      .input('back', back.trim())
      .input('notes', notes?.trim() || null);

    let setClause = 'front = @front, back = @back, notes = @notes, modified_at = GETDATE()';
    if (category !== undefined) {
      request.input('category', category?.trim() || null);
      setClause += ', category = @category';
    }
    if (isDraft !== undefined) {
      request.input('isDraft', isDraft ? 1 : 0);
      setClause += ', is_draft = @isDraft';
    }

    const result = await request.query(`
      UPDATE cards
      SET ${setClause}
      WHERE id = @cardId AND user_id = @userId -- user_id check is a safety net; ownership is enforced at the API layer
    `);

    if (result.rowsAffected[0] === 0) {
      throw new Error(`No card found for id: '${cardId}'`);
    }
  } catch (error) {
    console.error('Error updating card:', error);
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

// Input shape for upsertCards. Distinct from RefinedCard (the LLM refine/generation
// contract) so category can ride along here without touching that flow. `category` is
// tri-state like updateCard: omit (undefined) to leave an existing card's category
// untouched, null to clear it, or a string to set it. `isDraft` is likewise tri-state:
// omit to leave an existing card's draft flag untouched, or pass a boolean to set it
// (a new card with `isDraft` omitted falls back to the DB default of non-draft).
export interface UpsertCard {
  id: string | null;
  front: string;
  back: string;
  notes: string | null;
  category?: string | null;
  isDraft?: boolean;
}

// Creates and/or updates multiple cards in a deck in a single transaction. Cards with
// an id that belongs to this user+deck are updated; cards without one (or with an
// unrecognized id) are inserted. Unlike applyRefinedCards, cards omitted from the list
// are left untouched — nothing is deleted. Returns the resulting cards, in input order.
export async function upsertCards(userId: string, deckId: string, cards: UpsertCard[]): Promise<CardWithProgress[]> {
  if (cards.length === 0) return [];

  let pool;
  try {
    pool = await getRuneConnection();

    // Which provided ids actually belong to this user+deck
    const existingResult = await pool.request()
      .input('userId', userId)
      .input('deckId', deckId)
      .query(`SELECT id FROM cards WHERE deck_id = @deckId AND user_id = @userId`);
    const existingIds = new Set(existingResult.recordset.map((r: { id: string }) => r.id));
    let nextIndex = existingResult.recordset.length;

    const transaction = pool.transaction();
    await transaction.begin();

    const resultIds: string[] = [];

    try {
      for (const card of cards) {
        if (card.id && existingIds.has(card.id)) {
          const request = transaction.request()
            .input('userId', userId)
            .input('cardId', card.id)
            .input('front', card.front.trim())
            .input('back', card.back.trim())
            .input('notes', card.notes?.trim() || null);

          // Only touch category when the caller provided it (tri-state, mirrors updateCard):
          // omitted leaves the existing value, null clears, a string sets it.
          let setClause = 'front = @front, back = @back, notes = @notes, modified_at = GETDATE()';
          if (card.category !== undefined) {
            request.input('category', card.category?.trim() || null);
            setClause += ', category = @category';
          }
          // isDraft is tri-state too: only update the flag when explicitly provided.
          if (card.isDraft !== undefined) {
            request.input('isDraft', card.isDraft ? 1 : 0);
            setClause += ', is_draft = @isDraft';
          }

          await request.query(`
              UPDATE cards
              SET ${setClause}
              WHERE id = @cardId AND user_id = @userId
            `);
          resultIds.push(card.id);
        } else {
          const insertResult = await transaction.request()
            .input('userId', userId)
            .input('deckId', deckId)
            .input('front', card.front.trim())
            .input('back', card.back.trim())
            .input('notes', card.notes?.trim() || null)
            .input('category', card.category?.trim() || null)
            .input('isDraft', card.isDraft ? 1 : 0)
            .input('orderIndex', nextIndex++)
            .query(`
              INSERT INTO cards (user_id, deck_id, front, back, notes, category, is_draft, source, order_index)
              OUTPUT INSERTED.id
              VALUES (@userId, @deckId, @front, @back, @notes, @category, @isDraft, 'manual', @orderIndex)
            `);
          resultIds.push(insertResult.recordset[0].id);
        }
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    const allCards = await getCardsByDeckId(userId, deckId);
    const byId = new Map(allCards.map((c) => [c.id, c]));
    return resultIds.map((id) => byId.get(id)).filter((c): c is CardWithProgress => !!c);
  } catch (error) {
    console.error('Error upserting cards:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

// Applies a refined card set to a deck: updates modified cards, inserts new cards, deletes removed cards.
// Preserves spaced repetition progress for cards that are updated (not deleted).
export async function applyRefinedCards(userId: string, deckId: string, refinedCards: RefinedCard[]): Promise<{ updated: number; inserted: number; deleted: number }> {
  let pool;
  try {
    pool = await getRuneConnection();

    // Fetch existing card IDs for this deck
    const existingResult = await pool.request()
      .input('userId', userId)
      .input('deckId', deckId)
      .query(`SELECT id FROM cards WHERE deck_id = @deckId AND user_id = @userId`);
    const existingIds = new Set(existingResult.recordset.map((r: { id: string }) => r.id));

    // Partition refined cards into updates (has matching ID) and inserts (null ID)
    const toUpdate = refinedCards.filter((c) => c.id && existingIds.has(c.id));
    const toInsert = refinedCards.filter((c) => !c.id);

    // IDs in the refined set that exist in DB
    const keptIds = new Set(toUpdate.map((c) => c.id));

    // IDs in DB that are NOT in the refined set — these get deleted
    const toDeleteIds = [...existingIds].filter((id) => !keptIds.has(id));

    const transaction = pool.transaction();
    await transaction.begin();

    try {
      let updated = 0;
      let inserted = 0;
      let deleted = 0;

      // Update existing cards
      for (const card of toUpdate) {
        await transaction.request()
          .input('userId', userId)
          .input('cardId', card.id)
          .input('front', card.front.trim())
          .input('back', card.back.trim())
          .input('notes', card.notes?.trim() || null)
          .query(`
            UPDATE cards
            SET front = @front, back = @back, notes = @notes, modified_at = GETDATE()
            WHERE id = @cardId AND user_id = @userId
          `);
        updated++;
      }

      // Insert new cards
      let nextIndex = existingResult.recordset.length;
      for (const card of toInsert) {
        await transaction.request()
          .input('userId', userId)
          .input('deckId', deckId)
          .input('front', card.front.trim())
          .input('back', card.back.trim())
          .input('notes', card.notes?.trim() || null)
          .input('source', 'refine')
          .input('orderIndex', nextIndex++)
          .query(`
            INSERT INTO cards (user_id, deck_id, front, back, notes, source, order_index)
            VALUES (@userId, @deckId, @front, @back, @notes, @source, @orderIndex)
          `);
        inserted++;
      }

      // Delete removed cards (cascade: reviews → progress → card)
      for (const cardId of toDeleteIds) {
        await transaction.request()
          .input('cardId', cardId)
          .query(`DELETE FROM card_reviews WHERE card_id = @cardId`);

        await transaction.request()
          .input('cardId', cardId)
          .query(`DELETE FROM card_progress WHERE card_id = @cardId`);

        await transaction.request()
          .input('userId', userId)
          .input('cardId', cardId)
          .query(`DELETE FROM cards WHERE id = @cardId AND user_id = @userId`);
        deleted++;
      }

      await transaction.commit();
      console.log(`[ApplyRefinedCards] Deck '${deckId}': ${updated} updated, ${inserted} inserted, ${deleted} deleted`);
      return { updated, inserted, deleted };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error applying refined cards:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}
