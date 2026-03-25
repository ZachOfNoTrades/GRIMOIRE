import { getRuneConnection, closeRuneConnection } from './db';

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

  if (rating < 3) {
    // Failed: reset repetitions, short interval
    repetitions = 0;
    intervalDays = rating === 1 ? 0 : 1; // Again=same day, Hard=1 day
    easeFactor = Math.max(1.30, easeFactor - 0.20);
  } else {
    // Passed: advance repetitions
    repetitions = currentRepetitions + 1;

    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(currentInterval * easeFactor);
    }

    // Adjust ease factor
    const adjustment = 0.1 - (4 - rating) * 0.08;
    easeFactor = Math.max(1.30, easeFactor + adjustment);

    // Easy bonus
    if (rating === 4) {
      intervalDays = Math.round(intervalDays * 1.3);
    }
  }

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
