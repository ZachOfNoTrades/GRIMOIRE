import { getGolemConnection, closeGolemConnection } from './db';
import { MuscleGroup, ExerciseMuscleGroup } from '../types/muscleGroup';

export async function getAllMuscleGroups(): Promise<MuscleGroup[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request().query(`
      SELECT * FROM muscle_groups ORDER BY name
    `);

    if (result.recordset.length === 0) {
      console.warn('No muscle groups found');
    }

    return result.recordset;
  } catch (error) {
    console.error('Error fetching muscle groups:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function getExerciseMuscleGroups(exerciseId: string): Promise<ExerciseMuscleGroup[]> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('exerciseId', exerciseId)
      .query(`
        SELECT
          emg.id,
          emg.exercise_id,
          emg.muscle_group_id,
          mg.name AS muscle_group_name,
          emg.is_primary
        FROM exercise_muscle_groups emg
        JOIN muscle_groups mg ON emg.muscle_group_id = mg.id
        WHERE emg.exercise_id = @exerciseId
        ORDER BY emg.is_primary DESC, mg.name
      `);

    if (result.recordset.length === 0) {
      console.warn(`No muscle groups found for exercise id: '${exerciseId}'`);
    }

    return result.recordset;
  } catch (error) {
    console.error('Error fetching exercise muscle groups:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

export async function updateExerciseMuscleGroups(
  exerciseId: string,
  assignments: { muscleGroupId: string; isPrimary: boolean }[]
): Promise<void> {
  let pool;
  try {
    pool = await getGolemConnection();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Delete existing assignments
      await transaction.request()
        .input('exerciseId', exerciseId)
        .query(`DELETE FROM exercise_muscle_groups WHERE exercise_id = @exerciseId`);

      // Insert new assignments
      for (let i = 0; i < assignments.length; i++) {
        const assignment = assignments[i];
        await transaction.request()
          .input(`exerciseId`, exerciseId)
          .input(`muscleGroupId`, assignment.muscleGroupId)
          .input(`isPrimary`, assignment.isPrimary ? 1 : 0)
          .query(`
            INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
            VALUES (@exerciseId, @muscleGroupId, @isPrimary)
          `);
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error updating exercise muscle groups:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}
