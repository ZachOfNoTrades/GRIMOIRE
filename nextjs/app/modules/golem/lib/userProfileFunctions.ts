import { getGolemConnection, closeGolemConnection } from './db';
import { UserProfile } from '../types/userProfile';

export async function getUserProfile(userId: string): Promise<UserProfile> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .query(`
        SELECT id, user_id, profile_prompt, created_at, modified_at
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

export async function updateUserProfile(userId: string, profilePrompt: string | null): Promise<UserProfile> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('userId', userId)
      .input('profilePrompt', profilePrompt)
      .query(`
        MERGE INTO user_profiles AS dest
        USING (SELECT @userId AS user_id) AS source
        ON dest.user_id = source.user_id
        WHEN MATCHED THEN
          UPDATE SET profile_prompt = @profilePrompt, modified_at = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (user_id, profile_prompt)
          VALUES (@userId, @profilePrompt)
        OUTPUT INSERTED.*;
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
