"use client";

import { useEffect } from "react";

// Warn before the tab closes or reloads while a field holds text the server has not confirmed.
// In-app navigation is not covered: the blur save runs with keepalive, so it completes anyway.
export function useUnsavedWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);
}

// Ctrl+S / Cmd+S inside a field runs the save instead of the browser's save-page dialog.
export function saveOnShortcut(save: () => void) {
  return (event: React.KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      save();
    }
  };
}
