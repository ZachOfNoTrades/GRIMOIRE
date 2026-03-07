import { getGolemConnection, closeGolemConnection } from './db';
import { UserProfile } from '../types/userProfile';

export async function getUserProfile(): Promise<UserProfile> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request().query(`
      SELECT id, profile_prompt, created_at, modified_at
      FROM user_profile
      WHERE id = 1
    `);

    if (result.recordset.length === 0) {
      throw new Error('No user profile found');
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

export async function updateUserProfile(profilePrompt: string | null): Promise<UserProfile> {
  let pool;
  try {
    pool = await getGolemConnection();
    const result = await pool.request()
      .input('profilePrompt', profilePrompt)
      .query(`
        UPDATE user_profile
        SET profile_prompt = @profilePrompt,
            modified_at = GETDATE()
        OUTPUT INSERTED.*
        WHERE id = 1
      `);

    if (result.recordset.length === 0) {
      throw new Error('No user profile found');
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
