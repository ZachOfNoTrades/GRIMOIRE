import { getRuneConnection, closeRuneConnection } from './db';
import { DeckStudySession } from '../types/study';

// Anki-style interval fuzz: spreads intervals by a small random amount so cards
// learned together in one session don't all resurface on the exact same day
// (the "clustering pileup"). Ported from Anki's _fuzzIvlRange. Intervals of 0 or
// 1 day (same-day relearn / first step) are left exact — only mature intervals
// cluster, and jittering the short steps would just be noise.
function applyFuzz(intervalDays: number): number {
  if (intervalDays < 2) return intervalDays;

  let fuzz: number;
  if (intervalDays < 7) {
    fuzz = Math.floor(intervalDays * 0.25);
  } else if (intervalDays < 30) {
    fuzz = Math.max(2, Math.floor(intervalDays * 0.15));
  } else {
    fuzz = Math.max(4, Math.floor(intervalDays * 0.05));
  }
  fuzz = Math.max(1, fuzz);

  // Uniform random integer in [interval - fuzz, interval + fuzz].
  const span = 2 * fuzz + 1;
  return (intervalDays - fuzz) + Math.floor(Math.random() * span);
}

// SM-2 algorithm: calculates next review state based on rating (1-4)
// 1=Again, 2=Hard, 3=Good, 4=Easy
export function calculateNextReview(
  rating: number,
  currentEaseFactor: number,
  currentInterval: number,
  currentRepetitions: number,
): { easeFactor: number; intervalDays: number; repetitions: number } {
  let easeFactor = currentEaseFactor;
  let intervalDays: number;
  let repetitions: number;

  if (rating === 1) {
    // Again = lapse: reset the streak, relearn the same day, drop ease.
    repetitions = 0;
    intervalDays = 0;
    easeFactor = Math.max(1.30, easeFactor - 0.20);
  } else {
    // Hard (2), Good (3), Easy (4) are all passes — they advance the streak.
    // Hard is a pass (per standard SM-2/Anki), not a lapse: it keeps the card
    // in review and grows the interval slowly rather than resetting to 1 day.
    repetitions = currentRepetitions + 1;

    if (repetitions === 1) {
      // First pass. Hard/Good start at 1 day; Easy at 3 (not 1) so the bonus
      // below actually differentiates it — 1 * 1.3 rounds back down to 1.
      intervalDays = rating === 4 ? 3 : 1;
    } else if (repetitions === 2) {
      // Second pass: Hard graduates slower (3 days) than Good/Easy (6).
      intervalDays = rating === 2 ? 3 : 6;
    } else {
      // Mature card. Good/Easy multiply by ease; Hard uses a gentler fixed 1.2
      // factor so a persistently-Hard card still grows, just slowly.
      const factor = rating === 2 ? 1.2 : easeFactor;
      intervalDays = Math.round(currentInterval * factor);
    }

    // Adjust ease factor: Hard -0.06, Good +0.02, Easy +0.10 (floored at 1.30).
    const adjustment = 0.1 - (4 - rating) * 0.08;
    easeFactor = Math.max(1.30, easeFactor + adjustment);

    // Easy bonus
    if (rating === 4) {
      intervalDays = Math.round(intervalDays * 1.3);
    }
  }

  // Decluster: jitter the computed interval so same-session batches spread out.
  intervalDays = applyFuzz(intervalDays);

  return { easeFactor, intervalDays, repetitions };
}

// Creates a study session and returns its ID
export async function createStudySession(userId: string, deckId: string): Promise<string> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('deckId', deckId)
      .query(`
        INSERT INTO study_sessions (user_id, deck_id)
        OUTPUT INSERTED.id
        VALUES (@userId, @deckId)
      `);

    return result.recordset[0].id;
  } catch (error) {
    console.error('Error creating study session:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

// Creates a collection-scoped study session and returns its ID. Same row shape as a
// deck session, but scoped by collection_id (deck_id stays NULL) because the session
// spans every deck in the collection.
export async function createCollectionStudySession(userId: string, collectionId: string): Promise<string> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('collectionId', collectionId)
      .query(`
        INSERT INTO study_sessions (user_id, collection_id)
        OUTPUT INSERTED.id
        VALUES (@userId, @collectionId)
      `);

    return result.recordset[0].id;
  } catch (error) {
    console.error('Error creating collection study session:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

// Records a card review and updates card_progress using SM-2
export async function submitCardReview(
  userId: string,
  cardId: string,
  studySessionId: string,
  rating: number,
  responseTimeMs: number | null,
): Promise<void> {
  let pool;
  try {
    pool = await getRuneConnection();

    // Get current progress (or defaults for new cards)
    const progressResult = await pool.request()
      .input('userId', userId)
      .input('cardId', cardId)
      .query(`SELECT ease_factor, interval_days, repetitions FROM card_progress WHERE card_id = @cardId AND user_id = @userId`);

    const currentEaseFactor = progressResult.recordset.length > 0 ? parseFloat(progressResult.recordset[0].ease_factor) : 2.50;
    const currentInterval = progressResult.recordset.length > 0 ? progressResult.recordset[0].interval_days : 0;
    const currentRepetitions = progressResult.recordset.length > 0 ? progressResult.recordset[0].repetitions : 0;

    // Calculate next review state
    const next = calculateNextReview(rating, currentEaseFactor, currentInterval, currentRepetitions);

    // Calculate next review date
    const nextReviewAt = next.intervalDays === 0
      ? new Date() // Due immediately (Again)
      : new Date(Date.now() + next.intervalDays * 24 * 60 * 60 * 1000);

    // Insert card review record
    await pool.request()
      .input('userId', userId)
      .input('cardId', cardId)
      .input('studySessionId', studySessionId)
      .input('rating', rating)
      .input('responseTimeMs', responseTimeMs)
      .query(`
        INSERT INTO card_reviews (user_id, card_id, study_session_id, rating, response_time_ms)
        VALUES (@userId, @cardId, @studySessionId, @rating, @responseTimeMs)
      `);

    // Upsert card_progress
    if (progressResult.recordset.length > 0) {
      await pool.request()
        .input('userId', userId)
        .input('cardId', cardId)
        .input('easeFactor', next.easeFactor)
        .input('intervalDays', next.intervalDays)
        .input('repetitions', next.repetitions)
        .input('nextReviewAt', nextReviewAt)
        .query(`
          UPDATE card_progress
          SET ease_factor = @easeFactor, interval_days = @intervalDays, repetitions = @repetitions,
              next_review_at = @nextReviewAt, last_reviewed_at = GETDATE(), modified_at = GETDATE()
          WHERE card_id = @cardId AND user_id = @userId
        `);
    } else {
      await pool.request()
        .input('userId', userId)
        .input('cardId', cardId)
        .input('easeFactor', next.easeFactor)
        .input('intervalDays', next.intervalDays)
        .input('repetitions', next.repetitions)
        .input('nextReviewAt', nextReviewAt)
        .query(`
          INSERT INTO card_progress (user_id, card_id, ease_factor, interval_days, repetitions, next_review_at, last_reviewed_at)
          VALUES (@userId, @cardId, @easeFactor, @intervalDays, @repetitions, @nextReviewAt, GETDATE())
        `);
    }

    // Update study session counters
    const isCorrect = rating >= 3 ? 1 : 0;
    await pool.request()
      .input('userId', userId)
      .input('studySessionId', studySessionId)
      .input('isCorrect', isCorrect)
      .query(`
        UPDATE study_sessions
        SET cards_studied = cards_studied + 1,
            cards_correct = cards_correct + @isCorrect,
            modified_at = GETDATE()
        WHERE id = @studySessionId AND user_id = @userId
      `);

  } catch (error) {
    console.error('Error submitting card review:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

// Completes a study session with duration
export async function completeStudySession(userId: string, studySessionId: string, durationSeconds: number): Promise<void> {
  let pool;
  try {
    pool = await getRuneConnection();
    await pool.request()
      .input('userId', userId)
      .input('id', studySessionId)
      .input('duration', durationSeconds)
      .query(`
        UPDATE study_sessions
        SET completed_at = GETDATE(), duration = @duration, modified_at = GETDATE()
        WHERE id = @id AND user_id = @userId
      `);
  } catch (error) {
    console.error('Error completing study session:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}

// Every past study session that touched a deck, newest first — the deck page's history.
//
// Driven off card_reviews joined back to their session rather than off study_sessions
// directly, so a COLLECTION session (deck_id NULL) shows up here too, reporting only the
// slice of it that reviewed this deck's cards. Without that a deck studied mainly through
// a collection would report an empty history while its own "Last Reviewed" stat — which
// reads card_progress, and so counts collection reviews — said "Yesterday".
//
// Sessions that recorded no rating for this deck (opened and abandoned, or a collection
// run that never reached it) fall out naturally: they have no rows to group.
export async function getDeckStudySessions(userId: string, deckId: string): Promise<DeckStudySession[]> {
  let pool;
  try {
    pool = await getRuneConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('deckId', deckId)
      .query(`
        SELECT TOP 500
          ss.id,
          ss.started_at,
          ss.completed_at,
          col.name AS collection_name,
          COUNT(cr.id) AS reviews,
          COUNT(DISTINCT cr.card_id) AS cards,
          SUM(CASE WHEN cr.rating = 1 THEN 1 ELSE 0 END) AS again,
          SUM(CASE WHEN cr.rating = 2 THEN 1 ELSE 0 END) AS hard,
          SUM(CASE WHEN cr.rating = 3 THEN 1 ELSE 0 END) AS good,
          SUM(CASE WHEN cr.rating = 4 THEN 1 ELSE 0 END) AS easy,
          SUM(CASE WHEN cr.rating >= 3 THEN 1 ELSE 0 END) AS correct,
          -- Duration, best available: the session's own recorded duration when it was
          -- started here AND finished; the span from its start to its last rating when it
          -- was started here but abandoned; and for a collection session, the span of this
          -- deck's own ratings inside it (the rest of that session studied other decks).
          CASE
            WHEN ss.deck_id = @deckId AND ss.duration IS NOT NULL THEN ss.duration
            WHEN ss.deck_id = @deckId THEN DATEDIFF(SECOND, ss.started_at, MAX(cr.created_at))
            ELSE DATEDIFF(SECOND, MIN(cr.created_at), MAX(cr.created_at))
          END AS duration_seconds,
          CASE WHEN ss.deck_id = @deckId AND ss.duration IS NOT NULL THEN 1 ELSE 0 END AS is_duration_exact,
          AVG(CAST(cr.response_time_ms AS FLOAT)) AS avg_response_ms
        FROM card_reviews cr
        JOIN cards c ON c.id = cr.card_id
        JOIN study_sessions ss ON ss.id = cr.study_session_id
        LEFT JOIN collections col ON col.id = ss.collection_id
        WHERE c.deck_id = @deckId AND cr.user_id = @userId AND ss.user_id = @userId
        GROUP BY ss.id, ss.started_at, ss.completed_at, ss.duration, ss.deck_id, col.name
        ORDER BY ss.started_at DESC
      `);

    if (result.recordset.length === 0) {
      console.warn(`No study sessions found for deck id: '${deckId}'`);
    }

    // Coerce the BIT so the client can test it without truthiness surprises, and round the
    // FLOAT average — a mean of three int millisecond readings is otherwise 4283.333333.
    return result.recordset.map((row) => ({
      ...row,
      is_duration_exact: !!row.is_duration_exact,
      avg_response_ms: row.avg_response_ms == null ? null : Math.round(row.avg_response_ms),
    })) as DeckStudySession[];
  } catch (error) {
    console.error('Error fetching deck study sessions:', error);
    throw error;
  } finally {
    if (pool) {
      await closeRuneConnection(pool);
    }
  }
}
