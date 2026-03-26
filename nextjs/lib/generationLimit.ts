import { getMainConnection } from "@/lib/db";

const WINDOW_HOURS = parseInt(process.env.GENERATION_WINDOW_HOURS || "24", 10);

export async function checkGenerationLimit(userId: string, userLimit: number): Promise<{ allowed: boolean; count: number; limit: number }> {
  // 0 = unlimited
  if (userLimit === 0) {
    return { allowed: true, count: 0, limit: 0 };
  }

  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("userId", userId)
    .input("windowHours", WINDOW_HOURS)
    .query<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM generation_log
       WHERE user_id = @userId
         AND ts_created > DATEADD(HOUR, -@windowHours, GETDATE())`
    );

  const count = result.recordset[0].count;
  return {
    allowed: count < userLimit,
    count,
    limit: userLimit,
  };
}

export async function logGeneration(userId: string, endpoint: string): Promise<void> {
  const pool = await getMainConnection();
  await pool
    .request()
    .input("userId", userId)
    .input("endpoint", endpoint)
    .query(
      `INSERT INTO generation_log (user_id, endpoint)
       VALUES (@userId, @endpoint)`
    );

  console.log(`[Generation] user: '${userId}' endpoint: '${endpoint}' (${WINDOW_HOURS}h window)`);
}
