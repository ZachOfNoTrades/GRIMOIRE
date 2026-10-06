import { getMainConnection } from "@/lib/db";
import {
  coerceLlmTaskPrefs,
  DEFAULT_USER_PREFERENCES,
  isThemeMode,
  LlmTaskPrefs,
  UserPreferences,
  ThemeMode,
} from "@/types/preferences";
import { defaultTaskConfig, type LlmTaskId } from "@/lib/llm/tasks";
import type { LlmTaskConfig } from "@/lib/llm/types";

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
    .query<{ theme: string; llm_tasks: string | null }>(
      `SELECT theme, llm_tasks
       FROM user_preferences
       WHERE user_id = @userId`
    );

  if (result.recordset.length === 0) {
    return { ...DEFAULT_USER_PREFERENCES, llm_tasks: {} };
  }

  const { theme, llm_tasks } = result.recordset[0];
  let llmTasks: LlmTaskPrefs = {};
  if (llm_tasks) {
    try {
      llmTasks = coerceLlmTaskPrefs(JSON.parse(llm_tasks));
    } catch {
      console.warn(`Unreadable llm_tasks for user id: '${userId}' — using the defaults`);
    }
  }

  // A value outside the union can only come from a hand-edited row; fall back
  // rather than handing the client something it can't render.
  if (!isThemeMode(theme)) {
    console.warn(`Unknown theme '${theme}' for user id: '${userId}' — using the default`);
    return { ...DEFAULT_USER_PREFERENCES, llm_tasks: llmTasks };
  }

  return { theme, llm_tasks: llmTasks };
}

// The effective backend choice for one task: the stored entry, else the task default.
export async function getLlmTaskConfig(userId: string, task: LlmTaskId): Promise<LlmTaskConfig> {
  const prefs = await getUserPreferences(userId);
  return prefs.llm_tasks[task] ?? defaultTaskConfig(task);
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

  return getUserPreferences(userId);
}

// MERGE LLM TASK CHOICES — the given tasks replace their stored entries, every other
// task keeps what it had. Same upsert shape as the theme.
export async function updateLlmTaskPrefs(userId: string, patch: LlmTaskPrefs): Promise<UserPreferences> {
  const current = await getUserPreferences(userId);
  const next = coerceLlmTaskPrefs({ ...current.llm_tasks, ...patch });
  const pool = await getMainConnection();
  await pool
    .request()
    .input("userId", userId)
    .input("llmTasks", JSON.stringify(next))
    .query(
      `MERGE user_preferences AS target
       USING (SELECT @userId AS user_id) AS source
          ON target.user_id = source.user_id
       WHEN MATCHED THEN
          UPDATE SET llm_tasks = @llmTasks, ts_updated = GETDATE()
       WHEN NOT MATCHED THEN
          INSERT (user_id, llm_tasks) VALUES (source.user_id, @llmTasks);`
    );

  return { ...current, llm_tasks: next };
}
