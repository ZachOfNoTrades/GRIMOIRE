import { getGolemConnection, closeGolemConnection } from './db';
import { PreSurvey, PreSurveyMuscleFatigue, PreSurveyPayload } from '../types/preSurvey';

// Computes a 1-3 fatigue rating per muscle group based on the user's recently completed working sets.
// Primary-muscle hits count fully; secondary-muscle hits count half. Newer sessions dominate via MIN(days_ago).
// Excludes the current session so a not-yet-started session doesn't suppress its own recommendations.
//   1 = fresh    (no recent work, OR last hit >3.5 days ago)
//   2 = sore     (last hit within ~2.5 days OR moderate volume in the last 1.5 days)
//   3 = fatigued (heavy volume in the last 1.5 days)
export async function calculateAutoFatigue(userId: string, currentSessionId: string): Promise<PreSurveyMuscleFatigue[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('currentSessionId', currentSessionId)
      .query(`
        WITH recent_sets AS (
          SELECT
            emg.muscle_group_id,
            emg.is_primary,
            ws.id AS session_id,
            DATEDIFF(HOUR, ws.started_at, GETDATE()) / 24.0 AS days_ago
          FROM session_segment_sets sss
          JOIN session_segments ss ON sss.session_segment_id = ss.id
          JOIN workout_sessions ws ON ss.session_id = ws.id
          JOIN exercise_muscle_groups emg ON ss.exercise_id = emg.exercise_id
          WHERE ws.user_id = @userId
            AND ws.id <> @currentSessionId
            AND ws.is_completed = 1
            AND ws.started_at IS NOT NULL
            AND ws.started_at >= DATEADD(DAY, -7, GETDATE())
            AND sss.is_completed = 1
            AND sss.is_warmup = 0
            AND ss.is_warmup = 0
        )
        SELECT
          mg.id AS muscle_group_id,
          mg.name AS muscle_group_name,
          ISNULL(SUM(CASE WHEN rs.is_primary = 1 THEN 1.0 ELSE 0.5 END), 0) AS weighted_sets,
          MIN(rs.days_ago) AS days_ago
        FROM muscle_groups mg
        LEFT JOIN recent_sets rs ON rs.muscle_group_id = mg.id
        GROUP BY mg.id, mg.name
        ORDER BY mg.name
      `);

    return result.recordset.map((row: any) => {
      const weightedSets: number = row.weighted_sets ?? 0;
      const daysAgo: number | null = row.days_ago;

      let fatigue: number;
      if (daysAgo == null) {
        fatigue = 1; // No recent work in window
      } else if (daysAgo < 1.5 && weightedSets >= 6) {
        fatigue = 3;
      } else if (daysAgo < 1.5 || (daysAgo < 2.5 && weightedSets >= 3)) {
        fatigue = 2;
      } else {
        fatigue = 1;
      }

      return {
        muscle_group_id: row.muscle_group_id,
        muscle_group_name: row.muscle_group_name,
        fatigue,
      };
    });
  } catch (error) {
    console.error('Error calculating auto fatigue:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Returns the pre-survey for a session — notes from workout_sessions, per-muscle fatigue from session_pre_survey_muscles.
// Throws if the session does not exist (single-record lookup).
export async function getPreSurvey(userId: string, sessionId: string): Promise<PreSurvey> {
  let pool;
  try {
    pool = await getGolemConnection();

    const sessionResult = await pool.request()
      .input('userId', userId)
      .input('sessionId', sessionId)
      .query(`
        SELECT pre_survey_notes
        FROM workout_sessions
        WHERE id = @sessionId AND user_id = @userId
      `);

    if (sessionResult.recordset.length === 0) {
      throw new Error(`No workout session found for id: '${sessionId}'`);
    }

    const musclesResult = await pool.request()
      .input('userId', userId)
      .input('sessionId', sessionId)
      .query(`
        SELECT
          spsm.muscle_group_id,
          mg.name AS muscle_group_name,
          spsm.fatigue
        FROM session_pre_survey_muscles spsm
        JOIN muscle_groups mg ON spsm.muscle_group_id = mg.id
        WHERE spsm.session_id = @sessionId AND spsm.user_id = @userId
        ORDER BY mg.name
      `);

    const suggestions = await calculateAutoFatigue(userId, sessionId);

    return {
      notes: sessionResult.recordset[0].pre_survey_notes,
      muscles: musclesResult.recordset,
      suggestions,
    };
  } catch (error) {
    console.error('Error fetching pre-survey:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Upserts the entire pre-survey — replaces all muscle rows and updates notes on the session.
// Muscle rows with fatigue === null are removed (no fatigue recorded for that muscle).
export async function upsertPreSurvey(
  userId: string,
  sessionId: string,
  payload: PreSurveyPayload,
): Promise<PreSurvey> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Confirm session exists and belongs to user
      const sessionCheck = await transaction.request()
        .input('userId', userId)
        .input('sessionId', sessionId)
        .query(`
          SELECT 1 FROM workout_sessions WHERE id = @sessionId AND user_id = @userId
        `);

      if (sessionCheck.recordset.length === 0) {
        throw new Error(`No workout session found for id: '${sessionId}'`);
      }

      // Update notes on the session
      await transaction.request()
        .input('userId', userId)
        .input('sessionId', sessionId)
        .input('notes', payload.notes && payload.notes.trim().length > 0 ? payload.notes.trim() : null)
        .query(`
          UPDATE workout_sessions
          SET pre_survey_notes = @notes, modified_at = GETDATE()
          WHERE id = @sessionId AND user_id = @userId
        `);

      // Wipe and reinsert muscle rows (simpler than diffing; volume is small)
      await transaction.request()
        .input('userId', userId)
        .input('sessionId', sessionId)
        .query(`
          DELETE FROM session_pre_survey_muscles
          WHERE session_id = @sessionId AND user_id = @userId
        `);

      for (const muscle of payload.muscles) {
        // Skip out-of-range values defensively (CHECK constraint enforces too)
        if (muscle.fatigue < 1 || muscle.fatigue > 3) continue;

        await transaction.request()
          .input('userId', userId)
          .input('sessionId', sessionId)
          .input('muscleGroupId', muscle.muscle_group_id)
          .input('fatigue', muscle.fatigue)
          .query(`
            INSERT INTO session_pre_survey_muscles (user_id, session_id, muscle_group_id, fatigue)
            VALUES (@userId, @sessionId, @muscleGroupId, @fatigue)
          `);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }

    return await getPreSurvey(userId, sessionId);
  } catch (error) {
    console.error('Error upserting pre-survey:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Formats pre-survey data as a markdown section to inject into the LLM session-generation prompt.
// Returns an empty string when there is no data (so the prompt placeholder collapses cleanly).
export async function formatPreSurveyForPrompt(userId: string, sessionId: string): Promise<string> {
  const preSurvey = await getPreSurvey(userId, sessionId).catch(() => null);
  if (!preSurvey) return '';

  const hasMuscles = preSurvey.muscles.length > 0;
  const hasNotes = preSurvey.notes && preSurvey.notes.trim().length > 0;
  if (!hasMuscles && !hasNotes) return '';

  const lines: string[] = ['## Pre-Workout Survey'];
  lines.push('');
  lines.push('User-reported state going into this session. Fatigue scale: 1 = fresh, 2 = sore, 3 = fatigued. Use this to bias exercise selection — avoid heavy loading on muscles rated 3, favor 1-rated muscles for primary work, and respect any notes (e.g., injury, time-constrained).');

  if (hasMuscles) {
    lines.push('');
    lines.push('### Muscle fatigue');
    for (const m of preSurvey.muscles) {
      const label = m.fatigue === 1 ? 'fresh' : m.fatigue === 2 ? 'sore' : 'fatigued';
      lines.push(`- ${m.muscle_group_name}: ${m.fatigue} (${label})`);
    }
  }

  if (hasNotes) {
    lines.push('');
    lines.push('### Notes');
    lines.push(preSurvey.notes!.trim());
  }

  return lines.join('\n');
}
