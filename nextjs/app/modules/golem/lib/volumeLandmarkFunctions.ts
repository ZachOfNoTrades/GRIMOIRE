import { getGolemConnection, closeGolemConnection } from './db';
import { WeeklyMuscleGroupVolume } from '../types/volumeLandmark';

// Number of recent completed weeks to sample for calculating MEV/MRV
const LANDMARK_WINDOW_WEEKS = 8;

// Returns per-muscle-group working set counts for a given week, with MEV/MRV
// calculated from the user's recent completed weeks.
//
// MEV = minimum weekly working sets observed in recent completed weeks
// MRV = maximum weekly working sets observed in recent completed weeks
// Both null when insufficient history (< 2 completed weeks with data for that muscle group)
export async function getWeeklyVolumeByMuscleGroup(
  userId: string,
  weekId: string
): Promise<WeeklyMuscleGroupVolume[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('weekId', weekId)
      .input('windowWeeks', LANDMARK_WINDOW_WEEKS)
      .query(`
        -- Weekly working sets per muscle group for the selected week
        WITH current_week AS (
          SELECT emg.muscle_group_id, COUNT(*) AS working_sets
          FROM session_segment_sets sss
          JOIN session_segments ss ON sss.session_segment_id = ss.id
          JOIN workout_sessions ws ON ss.session_id = ws.id
          JOIN exercise_muscle_groups emg ON ss.exercise_id = emg.exercise_id
          WHERE ws.week_id = @weekId
            AND ws.user_id = @userId
            AND sss.is_warmup = 0
            AND sss.is_completed = 1
          GROUP BY emg.muscle_group_id
        ),
        -- Recent completed weeks (any week with at least one completed session)
        recent_weeks AS (
          SELECT TOP (@windowWeeks) w.id AS week_id, MAX(ws.started_at) AS week_start
          FROM weeks w
          JOIN workout_sessions ws ON ws.week_id = w.id
          WHERE w.user_id = @userId
            AND ws.is_completed = 1
            AND w.id <> @weekId -- exclude the current selected week
          GROUP BY w.id
          ORDER BY week_start DESC
        ),
        -- Working sets per muscle group per week in that window
        historical_sets AS (
          SELECT rw.week_id, emg.muscle_group_id, COUNT(*) AS working_sets
          FROM recent_weeks rw
          JOIN workout_sessions ws ON ws.week_id = rw.week_id
          JOIN session_segments ss ON ss.session_id = ws.id
          JOIN session_segment_sets sss ON sss.session_segment_id = ss.id
          JOIN exercise_muscle_groups emg ON ss.exercise_id = emg.exercise_id
          WHERE ws.user_id = @userId
            AND sss.is_warmup = 0
            AND sss.is_completed = 1
          GROUP BY rw.week_id, emg.muscle_group_id
        ),
        -- Aggregate min/max across weeks per muscle group
        landmarks AS (
          SELECT muscle_group_id,
                 MIN(working_sets) AS mev,
                 MAX(working_sets) AS mrv,
                 COUNT(*) AS week_count
          FROM historical_sets
          GROUP BY muscle_group_id
        )
        SELECT
          mg.id AS muscle_group_id,
          mg.name AS muscle_group_name,
          COALESCE(cw.working_sets, 0) AS working_sets,
          CASE WHEN l.week_count >= 2 THEN l.mev ELSE NULL END AS mev,
          CASE WHEN l.week_count >= 2 THEN l.mrv ELSE NULL END AS mrv
        FROM muscle_groups mg
        LEFT JOIN current_week cw ON cw.muscle_group_id = mg.id
        LEFT JOIN landmarks l ON l.muscle_group_id = mg.id
        ORDER BY mg.name
      `);

    if (result.recordset.length === 0) {
      console.warn('No muscle groups found for weekly volume calculation');
    }

    return result.recordset;
  } catch (error) {
    console.error('Error fetching weekly volume by muscle group:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Returns calculated MEV/MRV per muscle group across recent completed weeks.
// Used by LLM prompts — no specific week context, just historical landmarks.
export async function getCalculatedVolumeLandmarks(
  userId: string
): Promise<{ muscle_group_name: string; mev: number; mrv: number }[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('windowWeeks', LANDMARK_WINDOW_WEEKS)
      .query(`
        WITH recent_weeks AS (
          SELECT TOP (@windowWeeks) w.id AS week_id, MAX(ws.started_at) AS week_start
          FROM weeks w
          JOIN workout_sessions ws ON ws.week_id = w.id
          WHERE w.user_id = @userId
            AND ws.is_completed = 1
          GROUP BY w.id
          ORDER BY week_start DESC
        ),
        historical_sets AS (
          SELECT rw.week_id, emg.muscle_group_id, COUNT(*) AS working_sets
          FROM recent_weeks rw
          JOIN workout_sessions ws ON ws.week_id = rw.week_id
          JOIN session_segments ss ON ss.session_id = ws.id
          JOIN session_segment_sets sss ON sss.session_segment_id = ss.id
          JOIN exercise_muscle_groups emg ON ss.exercise_id = emg.exercise_id
          WHERE ws.user_id = @userId
            AND sss.is_warmup = 0
            AND sss.is_completed = 1
          GROUP BY rw.week_id, emg.muscle_group_id
        )
        SELECT mg.name AS muscle_group_name,
               MIN(hs.working_sets) AS mev,
               MAX(hs.working_sets) AS mrv,
               COUNT(*) AS week_count
        FROM historical_sets hs
        JOIN muscle_groups mg ON mg.id = hs.muscle_group_id
        GROUP BY mg.name
        HAVING COUNT(*) >= 2
        ORDER BY mg.name
      `);

    return result.recordset;
  } catch (error) {
    console.error('Error calculating volume landmarks:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Formats calculated volume landmarks as a markdown block for LLM prompts.
// Returns empty string if insufficient history.
export async function formatVolumeLandmarksForPrompt(userId: string): Promise<string> {
  const landmarks = await getCalculatedVolumeLandmarks(userId);

  if (landmarks.length === 0) {
    return '';
  }

  const rows = landmarks.map(l => `| ${l.muscle_group_name} | ${l.mev} | ${l.mrv} |`).join('\n');

  return `## Volume Landmarks (Working Sets Per Week)

These landmarks are derived from the user's recent completed training weeks — MEV is the minimum weekly working sets observed, MRV is the maximum. Use them as the user's tolerated training volume range. Prescribe session volume that keeps each muscle group within or near its MEV-MRV range across the week.

| Muscle Group | MEV | MRV |
| --- | --- | --- |
${rows}`;
}
