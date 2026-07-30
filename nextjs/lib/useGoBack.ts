"use client";

import { useRouter, usePathname } from "next/navigation";
import { moduleOf, previousPath } from "@/lib/navHistory";

// Shared "Back" navigation for top-of-page back buttons.
//
// Prefer real browser history (router.back) ONLY when the page it would pop back
// to is in the SAME module — so a session reached from the calendar goes back to
// the calendar, but jumping across modules (e.g. rune settings -> forage settings)
// and hitting Back lands on the current module's own page via `fallback` rather
// than bouncing back into the previous module. Also falls back when there is no
// in-app history to pop (fresh tab / direct link), so Back is never a dead end.
// Previous-route tracking is fed by NavHistoryTracker in the root layout.
export function useGoBack() {
  const router = useRouter();
  const pathname = usePathname();
  return (fallback?: string) => {
    const previous = previousPath();
    const sameModule =
      previous != null && pathname != null && moduleOf(previous) === moduleOf(pathname);
    if (sameModule) {
      router.back();
    } else if (fallback) {
      router.push(fallback);
    } else {
      router.back();
    }
  };
}
