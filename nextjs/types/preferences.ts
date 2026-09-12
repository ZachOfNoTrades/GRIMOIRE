// App-wide, per-user preferences (dbo.user_preferences in the MAIN database).
// Module-scoped settings live in their own module DB — forage_user_settings and
// friends; this file is only for settings that apply across the whole app.

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

// ONE USER'S PREFERENCES. A user with no `user_preferences` row reads back as
// the defaults below rather than 404 — the row is created on first write.
export interface UserPreferences {
  theme: ThemeMode;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: DEFAULT_THEME,
};
