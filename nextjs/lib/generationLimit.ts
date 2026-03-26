import { getMainConnection } from "@/lib/db";

const DAILY_GENERATION_LIMIT = parseInt(process.env.GENERATION_LIMIT || "15", 10);
const WINDOW_HOURS = parseInt(process.env.GENERATION_WINDOW_HOURS || "24", 10);
const ADMIN_BYPASS = process.env.GENERATION_ADMIN_BYPASS !== "false"; // true by default

export function shouldAdminBypassLimit(): boolean {
  return ADMIN_BYPASS;
}

export async function checkGenerationLimit(userId: string): Promise<{ allowed: boolean; count: number; limit: number }> {
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
    allowed: count < DAILY_GENERATION_LIMIT,
    count,
    limit: DAILY_GENERATION_LIMIT,
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

  // Log current usage
  const { count, limit } = await checkGenerationLimit(userId);
  console.log(`[Generation] user: '${userId}' endpoint: '${endpoint}' usage: ${count}/${limit} (${WINDOW_HOURS}h window)`);
}
