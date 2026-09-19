import { getRuneConnection, closeRuneConnection } from './db';
import type { RequestChannel } from '@/lib/permissions';
import { CardWithProgress, CardReview, CARD_SOURCE_REF_MAX, CARD_CATEGORY_MAX } from '../types/card';
import { GeneratedCard, RefinedCard } from '../types/generation';

// Normalizes a free-text card field to null-or-trimmed-string, clamped to `max` when the
// column is width-limited. Two failure modes this closes, both of which produced a 500:
// a non-string from a hand-rolled JSON body reached `.trim()` as a TypeError, and an
// over-long string overflowed the column. Callers above still validate and 400 — this is
// the backstop that keeps any future internal caller from reintroducing either.
function normText(value: unknown, max = Infinity): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

// Normalizes a card's back for storage. A card may legitimately have no answer — a question
// set imported ahead of its answers, or a self-graded recall card — so null/undefined/blank
// all collapse to the empty string. It is '' and not NULL because the column is NOT NULL and
// every reader (CardContent, the study session, card search) types `back` as a plain string;
// storing '' keeps that contract and needs no migration.
function normBack(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

// Every card write records the channel it arrived on in created_via / modified_via, so the
// deck view can attribute it ("Created 3d ago via MCP"). API routes derive it from the
// request with getRequestChannel(); MCP tool handlers pass 'mcp' literally. It defaults to
// 'web' rather than being required so an internal caller that genuinely has no request
// context still writes a sane value instead of a null the UI can't explain.

// `userId` is the cards' OWNER (the deck owner — cards keep that user_id whoever wrote them);
// `progressUserId` is whose schedule and last rating come back with each card. They differ
// when a sharee reads a shared deck: same cards, their own progress.
export async function getCardsByDeckId(userId: string, deckId: string, progressUserId: string = userId): Promise<CardWithProgress[]> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('progressUserId', progressUserId)
      .input('deckId', deckId)
      .query(`
        SELECT c.*, cp.ease_factor, cp.interval_days, cp.repetitions, cp.next_review_at, cp.last_reviewed_at,
          (SELECT TOP 1 cr.rating FROM card_reviews cr WHERE cr.card_id = c.id AND cr.user_id = @progressUserId ORDER BY cr.created_at DESC) AS last_rating
        FROM cards c
        LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = @progressUserId
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

// Same owner / progress split as getCardsByDeckId.
export async function getCardById(userId: string, id: string, progressUserId: string = userId): Promise<CardWithProgress> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('progressUserId', progressUserId)
      .input('id', id)
      .query(`
        SELECT c.*, cp.ease_factor, cp.interval_days, cp.repetitions, cp.next_review_at, cp.last_reviewed_at,
          (SELECT TOP 1 cr.rating FROM card_reviews cr WHERE cr.card_id = c.id AND cr.user_id = @progressUserId ORDER BY cr.created_at DESC) AS last_rating
        FROM cards c
        LEFT JOIN card_progress cp ON cp.card_id = c.id AND cp.user_id = @progressUserId
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

// Resolves the order_index a newly inserted card should take, making room for it first.
//
// With no anchor the card lands after everything (the historical append behaviour). With
// one, it lands DIRECTLY BELOW that card: every card at or past the anchor's successor is
// pushed down one, so the deck's manual order stays a contiguous integer run rather than
// drifting into fractional indices. That contiguity is what lets the table view number its
// rows and what `ORDER BY c.order_index` reads back.
//
// Takes a request factory rather than a pool so an insert can join a caller's transaction
// (the sheet save writes edits and inserts together, all-or-nothing).
async function makeRoomForInsert(
  newRequest: () => import('mssql').Request,
  deckId: string,
  afterCardId: string | null | undefined
): Promise<number> {
  if (!afterCardId) {
    const result = await newRequest()
      .input('deckId', deckId)
      .query(`SELECT ISNULL(MAX(order_index), -1) + 1 AS next_index FROM cards WHERE deck_id = @deckId`);
    return result.recordset[0].next_index;
  }

  // The anchor has to be in THIS deck — an id from another deck (a stale client list) would
  // otherwise silently append instead of failing, and the caller would never learn the row
  // it asked to insert below no longer exists here.
  const anchor = await newRequest()
    .input('deckId', deckId)
    .input('afterCardId', afterCardId)
    .query(`SELECT order_index FROM cards WHERE id = @afterCardId AND deck_id = @deckId`);
  if (anchor.recordset.length === 0) {
    throw new Error(`No card found for id: '${afterCardId}'`);
  }
  const anchorIndex: number = anchor.recordset[0].order_index;

  await newRequest()
    .input('deckId', deckId)
    .input('anchorIndex', anchorIndex)
    .query(`UPDATE cards SET order_index = order_index + 1 WHERE deck_id = @deckId AND order_index > @anchorIndex`);

  return anchorIndex + 1;
}

// Inserts a single card and returns it
export async function insertCard(userId: string, deckId: string, front: string, back: string | null | undefined, notes: string | null, category: string | null = null, isDraft: boolean = false, sourceRef: string | null = null, via: RequestChannel = 'web', afterCardId: string | null = null): Promise<CardWithProgress> {
  let pool;
  try {
    pool = await getRuneConnection();

    // Where the card goes: appended, or slotted directly below `afterCardId`. The
    // renumbering and the insert share one transaction — a half-applied shift would leave
    // two cards claiming the same index, which the manual order reads back as arbitrary.
    const transaction = pool.transaction();
    await transaction.begin();
    let card;
    try {
      const nextIndex = await makeRoomForInsert(() => transaction.request(), deckId, afterCardId);

      const result = await transaction.request()
        .input('userId', userId)
        .input('deckId', deckId)
        .input('front', front.trim())
        .input('back', normBack(back))
        .input('notes', normText(notes))
        .input('category', normText(category, CARD_CATEGORY_MAX))
        .input('isDraft', isDraft ? 1 : 0)
        .input('sourceRef', normText(sourceRef, CARD_SOURCE_REF_MAX))
        .input('orderIndex', nextIndex)
        .input('via', via)
        .query(`
          INSERT INTO cards (user_id, deck_id, front, back, notes, category, is_draft, source_ref, source, order_index, created_via, modified_via)
          OUTPUT INSERTED.*
          VALUES (@userId, @deckId, @front, @back, @notes, @category, @isDraft, @sourceRef, 'manual', @orderIndex, @via, @via)
        `);
      card = result.recordset[0];
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    // Return as CardWithProgress with null progress fields
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
// `sourceRef` (the user's citation) is tri-state for the same reason: the refine path
// rewrites front/back/notes and must not silently drop a citation the user typed.
export async function updateCard(userId: string, cardId: string, front: string, back: string | null | undefined, notes: string | null, category?: string | null, isDraft?: boolean, sourceRef?: string | null, via: RequestChannel = 'web'): Promise<void> {
  let pool;
  try {
    pool = await getRuneConnection();
    const request = pool.request()
      .input('userId', userId)
      .input('cardId', cardId)
      .input('front', front.trim())
      .input('notes', normText(notes))
      .input('via', via);

    let setClause = 'front = @front, notes = @notes, modified_at = GETDATE(), modified_via = @via';
    // `back` is tri-state like the fields below: omit (undefined) to leave the existing
    // answer alone, or pass a string (blank included) to set it. It became tri-state when
    // blank backs were allowed — with it always-set, a caller that simply didn't send a
    // back would silently wipe the answer, the same footgun the golem exercise PUT had.
    if (back !== undefined) {
      request.input('back', normBack(back));
      setClause += ', back = @back';
    }
    if (category !== undefined) {
      request.input('category', normText(category, CARD_CATEGORY_MAX));
      setClause += ', category = @category';
    }
    if (isDraft !== undefined) {
      request.input('isDraft', isDraft ? 1 : 0);
      setClause += ', is_draft = @isDraft';
    }
    if (sourceRef !== undefined) {
      request.input('sourceRef', normText(sourceRef, CARD_SOURCE_REF_MAX));
      setClause += ', source_ref = @sourceRef';
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

// One row of the deck table's sheet-edit save. Only the fields that view actually
// exposes as cells are here — `notes` and `source_ref` are deliberately absent, so a
// bulk save can never blank a field the sheet doesn't show (the footgun the golem
// exercise PUT had). Every field except the front is tri-state: omit it to leave the
// column untouched.
export interface CardSheetEdit {
  id: string;
  front: string;
  back?: string | null;
  notes?: string | null;
  category?: string | null;
  isDraft?: boolean;
}

// A brand-new row the sheet is saving. `afterCardId` is the row it was inserted below —
// null means it goes to the end of the deck. Only the fields the table has cells for; a
// sheet-created card gets no source ref, the same as one added from the table's trailing
// "Add card" row.
export interface CardSheetInsert {
  front: string;
  back?: string | null;
  notes?: string | null;
  category?: string | null;
  isDraft?: boolean;
  afterCardId?: string | null;
}

// Saves one pass over a deck's table view in a single transaction — edits to existing
// rows plus any rows inserted during that pass. The table edits every row at once and
// saves them with one button, so a half-applied batch (some rows saved, some not) must
// not be reachable.
//
// `edits` never insert: an id that isn't a card of this user's deck rolls the whole batch
// back, since in a sheet save it means the client is working from a stale list, not that a
// new card was meant. New rows arrive separately in `inserts`, each carrying the card it
// was added below — an anchor that isn't in the deck rolls the batch back for the same
// reason. Returns the number of rows updated and the created cards as stored.
export async function updateCardsBulk(userId: string, deckId: string, edits: CardSheetEdit[], via: RequestChannel = 'web', inserts: CardSheetInsert[] = []): Promise<{ updated: number; created: CardWithProgress[] }> {
  if (edits.length === 0 && inserts.length === 0) return { updated: 0, created: [] };

  let pool;
  try {
    pool = await getRuneConnection();
    const transaction = pool.transaction();
    await transaction.begin();
    const created: CardWithProgress[] = [];

    try {
      for (const edit of edits) {
        const request = transaction.request()
          .input('userId', userId)
          .input('deckId', deckId)
          .input('cardId', edit.id)
          .input('front', edit.front.trim())
          .input('via', via);

        // Same tri-state contract as updateCard: a field only enters the SET list when
        // the caller actually sent it.
        let setClause = 'front = @front, modified_at = GETDATE(), modified_via = @via';
        if (edit.back !== undefined) {
          request.input('back', normBack(edit.back));
          setClause += ', back = @back';
        }
        if (edit.notes !== undefined) {
          request.input('notes', normText(edit.notes));
          setClause += ', notes = @notes';
        }
        if (edit.category !== undefined) {
          request.input('category', normText(edit.category, CARD_CATEGORY_MAX));
          setClause += ', category = @category';
        }
        if (edit.isDraft !== undefined) {
          request.input('isDraft', edit.isDraft ? 1 : 0);
          setClause += ', is_draft = @isDraft';
        }

        const result = await request.query(`
          UPDATE cards
          SET ${setClause}
          WHERE id = @cardId AND deck_id = @deckId AND user_id = @userId -- deck + user scope; ownership is also enforced at the API layer
        `);

        if (result.rowsAffected[0] === 0) {
          throw new Error(`No card found for id: '${edit.id}'`);
        }
      }

      // INSERTS — run after the edits so an inserted row's anchor is resolved against the
      // deck as the save leaves it, and in the order the client listed them: two rows
      // inserted below the same anchor keep the sequence they were typed in, because each
      // shift pushes the previous one down. Same transaction as the edits, so the sheet
      // still saves whole or not at all.
      for (const insert of inserts) {
        const orderIndex = await makeRoomForInsert(() => transaction.request(), deckId, insert.afterCardId);
        const result = await transaction.request()
          .input('userId', userId)
          .input('deckId', deckId)
          .input('front', insert.front.trim())
          .input('back', normBack(insert.back))
          .input('notes', normText(insert.notes))
          .input('category', normText(insert.category, CARD_CATEGORY_MAX))
          .input('isDraft', insert.isDraft ? 1 : 0)
          .input('orderIndex', orderIndex)
          .input('via', via)
          .query(`
            INSERT INTO cards (user_id, deck_id, front, back, notes, category, is_draft, source_ref, source, order_index, created_via, modified_via)
            OUTPUT INSERTED.*
            VALUES (@userId, @deckId, @front, @back, @notes, @category, @isDraft, NULL, 'manual', @orderIndex, @via, @via)
          `);
        created.push({
          ...result.recordset[0],
          ease_factor: null,
          interval_days: null,
          repetitions: null,
          next_review_at: null,
          last_reviewed_at: null,
          last_rating: null,
        } as CardWithProgress);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return { updated: edits.length, created };
  } catch (error) {
    console.error('Error bulk-saving cards:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

// Inserts multiple cards into a deck in a single transaction. Returns the number of cards inserted.
export async function insertCards(userId: string, deckId: string, cards: GeneratedCard[], source: string = 'notion', via: RequestChannel = 'web'): Promise<number> {
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
          .input('back', normBack(card.back))
          .input('notes', normText(card.notes))
          .input('source', source)
          .input('orderIndex', card.order_index)
          .input('via', via)
          .query(`
            INSERT INTO cards (user_id, deck_id, front, back, notes, source, order_index, created_via, modified_via)
            VALUES (@userId, @deckId, @front, @back, @notes, @source, @orderIndex, @via, @via)
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
// `sourceRef` (the user's citation) is tri-state too: omit to leave an updated card's
// existing citation alone, null to clear it, or a string to set it.
export interface UpsertCard {
  id: string | null;
  front: string;
  // Tri-state like the optional fields below: omit to leave an updated card's existing
  // answer untouched, or pass a string (blank included) to set it. A new card with `back`
  // omitted is created unanswered.
  back?: string | null;
  notes: string | null;
  category?: string | null;
  isDraft?: boolean;
  sourceRef?: string | null;
}

// Creates and/or updates multiple cards in a deck in a single transaction. Cards with
// an id that belongs to this user+deck are updated; cards without one (or with an
// unrecognized id) are inserted. Unlike applyRefinedCards, cards omitted from the list
// are left untouched — nothing is deleted. Returns the resulting cards, in input order.
export async function upsertCards(userId: string, deckId: string, cards: UpsertCard[], via: RequestChannel = 'web'): Promise<CardWithProgress[]> {
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
            .input('notes', normText(card.notes))
            .input('via', via);

          // Only touch category when the caller provided it (tri-state, mirrors updateCard):
          // omitted leaves the existing value, null clears, a string sets it.
          let setClause = 'front = @front, notes = @notes, modified_at = GETDATE(), modified_via = @via';
          // `back` is tri-state for the same reason — an entry that only means to retag a
          // card must not blank out its answer.
          if (card.back !== undefined) {
            request.input('back', normBack(card.back));
            setClause += ', back = @back';
          }
          if (card.category !== undefined) {
            request.input('category', normText(card.category, CARD_CATEGORY_MAX));
            setClause += ', category = @category';
          }
          // isDraft is tri-state too: only update the flag when explicitly provided.
          if (card.isDraft !== undefined) {
            request.input('isDraft', card.isDraft ? 1 : 0);
            setClause += ', is_draft = @isDraft';
          }
          // sourceRef likewise — omitted leaves the user's existing citation intact.
          if (card.sourceRef !== undefined) {
            request.input('sourceRef', normText(card.sourceRef, CARD_SOURCE_REF_MAX));
            setClause += ', source_ref = @sourceRef';
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
            .input('back', normBack(card.back))
            .input('notes', normText(card.notes))
            .input('category', normText(card.category, CARD_CATEGORY_MAX))
            .input('isDraft', card.isDraft ? 1 : 0)
            .input('sourceRef', normText(card.sourceRef, CARD_SOURCE_REF_MAX))
            .input('orderIndex', nextIndex++)
            .input('via', via)
            .query(`
              INSERT INTO cards (user_id, deck_id, front, back, notes, category, is_draft, source_ref, source, order_index, created_via, modified_via)
              OUTPUT INSERTED.id
              VALUES (@userId, @deckId, @front, @back, @notes, @category, @isDraft, @sourceRef, 'manual', @orderIndex, @via, @via)
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
export async function applyRefinedCards(userId: string, deckId: string, refinedCards: RefinedCard[], via: RequestChannel = 'web'): Promise<{ updated: number; inserted: number; deleted: number }> {
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
          .input('back', normBack(card.back))
          .input('notes', normText(card.notes))
          .input('via', via)
          .query(`
            UPDATE cards
            SET front = @front, back = @back, notes = @notes, modified_at = GETDATE(), modified_via = @via
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
          .input('back', normBack(card.back))
          .input('notes', normText(card.notes))
          .input('source', 'refine')
          .input('orderIndex', nextIndex++)
          .input('via', via)
          .query(`
            INSERT INTO cards (user_id, deck_id, front, back, notes, source, order_index, created_via, modified_via)
            VALUES (@userId, @deckId, @front, @back, @notes, @source, @orderIndex, @via, @via)
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

// Rewrites a deck's manual card order to the sequence given — the deck page's table view
// lets a row be dragged to a new position, and `order_index` is what that position is read
// back from.
//
// The whole deck is renumbered from a single list rather than patching the moved card's
// index, so the run stays contiguous no matter how many drags have been made; the caller
// builds that list by moving ONE card within the deck's existing order, which is what keeps
// every other card's relative position untouched. One transaction, because a half-applied
// renumber leaves two cards claiming the same index and the order reads back arbitrary.
// Ids that aren't cards of this user's deck update nothing and are ignored — a stale client
// list moves the cards it can and the next fetch corrects it, rather than failing the drag.
export async function reorderCards(userId: string, deckId: string, orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;

  let pool;
  try {
    pool = await getRuneConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      for (let i = 0; i < orderedIds.length; i++) {
        await transaction.request()
          .input('userId', userId)
          .input('deckId', deckId)
          .input('cardId', orderedIds[i])
          .input('orderIndex', i)
          .query(`
            UPDATE cards
            SET order_index = @orderIndex
            WHERE id = @cardId AND deck_id = @deckId AND user_id = @userId -- deck + user scope; ownership is also enforced at the API layer
          `);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error reordering cards:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}
