import { getMainConnection } from "@/lib/db";
import { User } from "@/types/user";

export async function getAllUsers(): Promise<User[]> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .query<User>(
      `SELECT id, email, name, global_admin, generation_limit, enabled, ts_created, ts_updated
       FROM users
       ORDER BY ts_created DESC`
    );

  if (result.recordset.length === 0) {
    console.warn("No users found");
  }

  return result.recordset;
}

export async function getUserById(id: string): Promise<User> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("id", id)
    .query<User>(
      `SELECT id, email, name, global_admin, generation_limit, enabled, ts_created, ts_updated
       FROM users
       WHERE id = @id`
    );

  if (result.recordset.length === 0) {
    throw new Error(`No user found for id: '${id}'`);
  }

  return result.recordset[0];
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("email", email)
    .query<User>(
      `SELECT id, email, name, global_admin, generation_limit, enabled, ts_created, ts_updated
       FROM users
       WHERE email = @email`
    );

  if (result.recordset.length === 0) {
    return null;
  }

  return result.recordset[0];
}

export async function createUser(email: string, name: string): Promise<User> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("email", email)
    .input("name", name)
    .query<User>(
      `INSERT INTO users (email, name)
       OUTPUT INSERTED.id, INSERTED.email, INSERTED.name, INSERTED.global_admin, INSERTED.generation_limit, INSERTED.enabled, INSERTED.ts_created, INSERTED.ts_updated
       VALUES (@email, @name)`
    );

  return result.recordset[0];
}

export async function updateUser(
  id: string,
  data: { name?: string; email?: string; global_admin?: boolean; generation_limit?: number; enabled?: boolean }
): Promise<User> {
  const pool = await getMainConnection();

  // Build SET clause dynamically from provided fields
  const setClauses: string[] = [];
  const request = pool.request().input("id", id);

  if (data.name !== undefined) {
    setClauses.push("name = @name");
    request.input("name", data.name);
  }
  if (data.email !== undefined) {
    setClauses.push("email = @email");
    request.input("email", data.email);
  }
  if (data.global_admin !== undefined) {
    setClauses.push("global_admin = @globalAdmin");
    request.input("globalAdmin", data.global_admin ? 1 : 0);
  }
  if (data.generation_limit !== undefined) {
    setClauses.push("generation_limit = @generationLimit");
    request.input("generationLimit", data.generation_limit);
  }
  if (data.enabled !== undefined) {
    setClauses.push("enabled = @enabled");
    request.input("enabled", data.enabled ? 1 : 0);
  }

  if (setClauses.length === 0) {
    return getUserById(id);
  }

  setClauses.push("ts_updated = GETDATE()");

  const result = await request.query<User>(
    `UPDATE users
     SET ${setClauses.join(", ")}
     OUTPUT INSERTED.id, INSERTED.email, INSERTED.name, INSERTED.global_admin, INSERTED.generation_limit, INSERTED.enabled, INSERTED.ts_created, INSERTED.ts_updated
     WHERE id = @id`
  );

  if (result.recordset.length === 0) {
    throw new Error(`No user found for id: '${id}'`);
  }

  return result.recordset[0];
}

export async function deleteUser(id: string): Promise<void> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("id", id)
    .query(`DELETE FROM users WHERE id = @id`);

  if (result.rowsAffected[0] === 0) {
    throw new Error(`No user found for id: '${id}'`);
  }
}

export async function getGlobalAdminCount(): Promise<number> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM users WHERE global_admin = 1 AND enabled = 1`
    );

  return result.recordset[0].count;
}
