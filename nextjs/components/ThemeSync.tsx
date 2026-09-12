"use client";

import { useEffect } from "react";
import { isThemeMode } from "@/types/preferences";
import {
  applyTheme,
  readStoredTheme,
  writeStoredTheme,
} from "@/lib/useTheme";

// THEME SYNC — mounted app-wide (see app/layout.tsx).
//
// The pre-paint script has already stamped <html> from the localStorage mirror,
// which is right on every load after the first. This closes the two gaps that
// leaves: a device that has never painted this app (empty mirror, so it painted
// the OS preference even though the user pinned a theme elsewhere), and a
// preference changed on another device. It fetches the saved preference once,
// re-stamps only if it differs, and keeps the mirror current for the next load.
//
// Rendered on every page, but the fetch is one small GET per app load, and it
// deliberately does nothing on failure — the painted theme stays as it is.
export default function ThemeSync() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/users/me/preferences");
        if (!response.ok) return; // unauthenticated (signin page) or transient
        const data = await response.json();
        if (cancelled || !isThemeMode(data?.theme)) return;

        if (data.theme !== readStoredTheme()) {
          writeStoredTheme(data.theme);
          applyTheme(data.theme);
        }
      } catch {
        /* keep whatever is painted */
      }
    })();

    // Another tab changed the preference — follow it without a reload.
    const onStorage = () => applyTheme(readStoredTheme());
    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
