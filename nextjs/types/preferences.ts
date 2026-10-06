// App-wide, per-user preferences (dbo.user_preferences in the MAIN database).
// Module-scoped settings live in their own module DB — forage_user_settings and
// friends; this file is only for settings that apply across the whole app.

import { isLlmBackend, type LlmTaskConfig } from "@/lib/llm/types";
import { isLlmTaskId, type LlmTaskId } from "@/lib/llm/tasks";

// THEME MODE — "auto" defers to the browser/OS color scheme
// (prefers-color-scheme); "light" / "dark" pin the app regardless of it.
export type ThemeMode = "auto" | "light" | "dark";

// Every valid mode, in the order the settings UI offers them.
export const THEME_MODES: ThemeMode[] = ["auto", "light", "dark"];

export const DEFAULT_THEME: ThemeMode = "auto";

// Runtime guard — the API and the client both parse untrusted values with this.
export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as string[]).includes(value);
}

// LLM TASK PREFERENCES — which backend (and, for OpenRouter, which model) each kind
// of model call uses. Keyed by lib/llm/tasks.ts; a task that is absent uses the
// default, the shared Claude CLI.
export type LlmTaskPrefs = Partial<Record<LlmTaskId, LlmTaskConfig>>;

// Parse an untrusted JSON value (the DB column or a request body) into prefs:
// unknown tasks and backends are dropped, the model is trimmed and capped.
export function coerceLlmTaskPrefs(value: unknown): LlmTaskPrefs {
  const prefs: LlmTaskPrefs = {};
  if (!value || typeof value !== "object") return prefs;
  for (const [task, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isLlmTaskId(task) || !raw || typeof raw !== "object") continue;
    const item = raw as { backend?: unknown; model?: unknown };
    if (!isLlmBackend(item.backend)) continue;
    const model = typeof item.model === "string" ? item.model.trim().slice(0, 120) : "";
    prefs[task] = model ? { backend: item.backend, model } : { backend: item.backend };
  }
  return prefs;
}

// ONE USER'S PREFERENCES. A user with no `user_preferences` row reads back as
// the defaults below rather than 404 — the row is created on first write.
export interface UserPreferences {
  theme: ThemeMode;
  llm_tasks: LlmTaskPrefs;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: DEFAULT_THEME,
  llm_tasks: {},
};
