"use client";

import { useEffect } from "react";

// Warn before the tab closes or reloads while a form holds changes the server has not confirmed
// NOTE: In-app navigation, such as a link or breadcrumb, does not fire beforeunload
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
