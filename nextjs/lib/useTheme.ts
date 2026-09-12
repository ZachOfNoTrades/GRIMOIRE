"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_THEME, isThemeMode, ThemeMode } from "@/types/preferences";

// THEME PLUMBING
//
// The saved preference (auto | light | dark) lives in dbo.user_preferences, so
// it follows the user across devices. It is MIRRORED into localStorage because
// the palette has to be right on the FIRST PAINT: the pre-paint script in
// app/layout.tsx reads that mirror, resolves "auto" against
// prefers-color-scheme, and stamps `data-theme="light|dark"` on <html> before
// anything renders. globals.css keys its dark palette off that attribute.
//
// So: localStorage = "what to paint right now", the database = "what this user
// chose", and ThemeSync reconciles the two after mount.

export const THEME_STORAGE_KEY = "grimoire.theme";

// Read the mirrored preference. Storage can throw (private mode, blocked site
// data), so every access is guarded and falls back to the default.
export function readStoredTheme(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function writeStoredTheme(theme: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* a viewer who blocks site data just re-resolves on the next load */
  }
}

// Resolve a preference to the palette that should actually be painted.
export function resolveTheme(theme: ThemeMode): "light" | "dark" {
  if (theme === "light" || theme === "dark") return theme;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

// Stamp the resolved palette on <html>. Same attribute the pre-paint script
// writes, so this is a no-op on load and only does work when the user picks a
// different mode (or the OS flips while on "auto").
export function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = resolveTheme(theme);
}

// THEME HOOK — current preference plus a setter that saves it.
export function useTheme() {
  // INPUT
  const [theme, setTheme] = useState<ThemeMode>(DEFAULT_THEME);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Adopt the mirrored value immediately (it's what's already painted), then
  // confirm against the database — another device may have changed it.
  useEffect(() => {
    let cancelled = false;
    const stored = readStoredTheme();
    setTheme(stored);

    (async () => {
      try {
        const response = await fetch("/api/users/me/preferences");
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled || !isThemeMode(data?.theme)) return;
        setTheme(data.theme);
        writeStoredTheme(data.theme);
        applyTheme(data.theme);
      } catch {
        /* offline / transient — the mirrored value stays in effect */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // While on "auto", track the OS flipping between light and dark.
  useEffect(() => {
    if (theme !== "auto") return;
    let media: MediaQueryList;
    try {
      media = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const onChange = () => applyTheme("auto");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  // Optimistic save: paint the new palette and close out the interaction now,
  // persist in the background, roll back if the write fails.
  const changeTheme = useCallback(
    async (next: ThemeMode): Promise<boolean> => {
      const previous = theme;
      if (next === previous) return true;

      setTheme(next);
      writeStoredTheme(next);
      applyTheme(next);
      setIsSaving(true);

      try {
        const response = await fetch("/api/users/me/preferences", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ theme: next }),
        });
        if (!response.ok) throw new Error(`PUT failed: ${response.status}`);
        return true;
      } catch (error) {
        console.error("Error saving theme:", error);
        setTheme(previous);
        writeStoredTheme(previous);
        applyTheme(previous);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [theme]
  );

  return { theme, changeTheme, isLoading, isSaving };
}
