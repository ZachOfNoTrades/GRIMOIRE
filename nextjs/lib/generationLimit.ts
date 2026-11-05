import { getMainConnection } from "@/lib/db";

// Rolling window (hours) the per-user generation limit counts over. Server-only env — client
// surfaces must receive it from an API response, never read process.env themselves.
export const GENERATION_WINDOW_HOURS = parseInt(process.env.GENERATION_WINDOW_HOURS || "24", 10) || 24;

// A GenerationAllowance is a user's generation limit and whether they may generate without one.
export interface GenerationAllowance {
  generationLimit: number;
  isGenerationUnlimited: boolean;
}

// Read a user's generation allowance from their row, allowing no generations when the limit is missing
export function toGenerationAllowance(row: { generation_limit?: number | null; is_generation_unlimited?: boolean | null }): GenerationAllowance {
  return {
    generationLimit: row.generation_limit ?? 0,
    isGenerationUnlimited: row.is_generation_unlimited === true,
  };
}

// Check whether a user may start another generation within the rolling window
export async function checkGenerationLimit(userId: string, allowance: GenerationAllowance): Promise<{ allowed: boolean; count: number; limit: number }> {
  // Allow an unlimited user without counting
  if (allowance.isGenerationUnlimited) {
    return { allowed: true, count: 0, limit: 0 };
  }

  // Refuse a limit of 0 or less without counting
  if (!(allowance.generationLimit > 0)) {
    return { allowed: false, count: 0, limit: 0 };
  }

  const userLimit = allowance.generationLimit;
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("userId", userId)
    .input("windowHours", GENERATION_WINDOW_HOURS)
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

  console.log(`[Generation] user: '${userId}' endpoint: '${endpoint}' (${GENERATION_WINDOW_HOURS}h window)`);
}
