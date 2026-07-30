import { getGolemConnection, closeGolemConnection } from './db';
import { UserProfile } from '../types/userProfile';

export async function getUserProfile(userId: string): Promise<UserProfile> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .query(`
        SELECT id, user_id, profile_prompt, distance_unit_short, distance_unit_long,
               rest_timer_enabled, created_at, modified_at
        FROM user_profiles
        WHERE user_id = @userId
      `);

    if (result.recordset.length === 0) {
      throw new Error(`No user profile found for user id: '${userId}'`);
    }

    return result.recordset[0];
  } catch (error) {
    console.error('Error fetching user profile:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}

// Partial update — only the fields present in `updates` are written; omitted fields are left unchanged.
// `distanceUnitShort`/`distanceUnitLong` are the user's preferred display units for the two distance bands.
// `restTimerEnabled` gates the between-sets rest countdown.
export async function updateUserProfile(
  userId: string,
  updates: {
    profilePrompt?: string | null;
    distanceUnitShort?: string | null;
    distanceUnitLong?: string | null;
    restTimerEnabled?: boolean;
  },
): Promise<UserProfile> {
  let pool;
  try {
    pool = await getGolemConnection();

    // Ensure a profile row exists so the subsequent UPDATE always targets one.
    await pool.request()
      .input('userId', userId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = @userId)
          INSERT INTO user_profiles (user_id) VALUES (@userId);
      `);

    // Build the SET clause from only the provided fields (undefined = leave unchanged).
    const request = pool.request().input('userId', userId);
    const setClauses: string[] = [];
    if (updates.profilePrompt !== undefined) {
      request.input('profilePrompt', updates.profilePrompt);
      setClauses.push('profile_prompt = @profilePrompt');
    }
    if (updates.distanceUnitShort !== undefined) {
      request.input('distanceUnitShort', updates.distanceUnitShort);
      setClauses.push('distance_unit_short = @distanceUnitShort');
    }
    if (updates.distanceUnitLong !== undefined) {
      request.input('distanceUnitLong', updates.distanceUnitLong);
      setClauses.push('distance_unit_long = @distanceUnitLong');
    }
    if (updates.restTimerEnabled !== undefined) {
      request.input('restTimerEnabled', updates.restTimerEnabled);
      setClauses.push('rest_timer_enabled = @restTimerEnabled');
    }
    setClauses.push('modified_at = GETDATE()');

    const result = await request.query(`
      UPDATE user_profiles
      SET ${setClauses.join(', ')}
      OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.profile_prompt,
             INSERTED.distance_unit_short, INSERTED.distance_unit_long,
             INSERTED.rest_timer_enabled, INSERTED.created_at, INSERTED.modified_at
      WHERE user_id = @userId;
    `);

    if (result.recordset.length === 0) {
      throw new Error(`No user profile found for user id: '${userId}'`);
    }

    return result.recordset[0];
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  } finally {
    if (pool) {
      await closeGolemConnection(pool);
    }
  }
}
