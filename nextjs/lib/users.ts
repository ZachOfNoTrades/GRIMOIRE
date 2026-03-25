import { getMainConnection } from "@/lib/db";
import { User } from "@/types/user";

export async function getUserByEmail(email: string): Promise<User | null> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("email", email)
    .query<User>(
      `SELECT id, email, name, global_admin, enabled, ts_created, ts_updated
       FROM users
       WHERE email = @email`
    );

  if (result.recordset.length === 0) {
    return null;
  }

  return result.recordset[0];
}
