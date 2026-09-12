import { getMainConnection } from "@/lib/db";
import {
  DEFAULT_USER_PREFERENCES,
  isThemeMode,
  UserPreferences,
  ThemeMode,
} from "@/types/preferences";

// APP-WIDE PER-USER PREFERENCES — dbo.user_preferences in the MAIN database.
// A row is created on the first write, so "no row" is a normal state meaning
// "this user has never changed anything": these reads return the application
// defaults instead of throwing, which is the one documented exception to the
// lib contract of throwing on an empty single-record lookup.

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const pool = await getMainConnection();
  const result = await pool
    .request()
    .input("userId", userId)
    .query<{ theme: string }>(
      `SELECT theme
       FROM user_preferences
       WHERE user_id = @userId`
    );

  if (result.recordset.length === 0) {
    return { ...DEFAULT_USER_PREFERENCES };
  }

  const { theme } = result.recordset[0];

  // A value outside the union can only come from a hand-edited row; fall back
  // rather than handing the client something it can't render.
  if (!isThemeMode(theme)) {
    console.warn(`Unknown theme '${theme}' for user id: '${userId}' — using the default`);
    return { ...DEFAULT_USER_PREFERENCES };
  }

  return { theme };
}

// UPSERT THE THEME — one statement so a first write and an update are the same
// call, and concurrent writes from two tabs can't insert a duplicate row.
export async function updateUserTheme(userId: string, theme: ThemeMode): Promise<UserPreferences> {
  const pool = await getMainConnection();
  await pool
    .request()
    .input("userId", userId)
    .input("theme", theme)
    .query(
      `MERGE user_preferences AS target
       USING (SELECT @userId AS user_id, @theme AS theme) AS source
          ON target.user_id = source.user_id
       WHEN MATCHED THEN
          UPDATE SET theme = source.theme, ts_updated = GETDATE()
       WHEN NOT MATCHED THEN
          INSERT (user_id, theme) VALUES (source.user_id, source.theme);`
    );

  return { theme };
}
