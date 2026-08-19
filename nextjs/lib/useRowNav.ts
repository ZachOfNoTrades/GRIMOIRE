"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type React from "react";

// Elements that own their own click. A row's action buttons (favorite star,
// delete, a nested link) already stop propagation on a LEFT click, but nothing
// stops an `auxclick`, so without this guard middle-clicking the star would
// open the row's page in a new tab.
const INTERACTIVE_SELECTOR = 'a[href], button, input, select, textarea, [role="button"], [role="link"]';

function hitsOwnControl(event: React.MouseEvent<HTMLElement>): boolean {
  const target = event.target as HTMLElement | null;
  const owner = target?.closest(INTERACTIVE_SELECTOR);
  return owner != null && owner !== event.currentTarget;
}

// Whether this click means "open somewhere other than the current tab" — the
// gestures a real <a href> handles natively.
function wantsNewContext(event: React.MouseEvent<HTMLElement>): "tab" | "window" | null {
  if (event.button === 1) return "tab";
  if (event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey) return "tab";
  if (event.shiftKey) return "window";
  return null;
}

export type RowNavProps = {
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  onAuxClick: (event: React.MouseEvent<HTMLElement>) => void;
  onMouseDown: (event: React.MouseEvent<HTMLElement>) => void;
};

// ROW NAVIGATION — click handling for a clickable <tr>/<div> that navigates.
//
// These containers can't be anchors (a <tr> can't be wrapped in one, and a card
// with its own buttons inside can't nest interactive content), so they navigate
// with `onClick={() => router.push(href)}`. That silently drops every gesture a
// link gives you for free: a middle button never fires a `click` event at all,
// and ctrl/cmd-click just navigates the current tab. This restores them.
//
// Plain left-click behaviour is deliberately left untouched — it still goes
// through the router (or `onActivate`, for rows that do something before
// navigating), so existing pages behave exactly as they did.
//
// Returns a FACTORY, not the props themselves: rows are built inside `.map()`,
// where a hook can't be called. Call `useRowNav()` once in the component, then
// `{...rowNav(href)}` per row.
export function useRowNav() {
  const router = useRouter();

  return useCallback(
    (href: string, onActivate?: () => void): RowNavProps => ({
      onClick: (event) => {
        const context = wantsNewContext(event);
        if (context) {
          if (hitsOwnControl(event)) return;
          event.preventDefault();
          window.open(href, "_blank", context === "window" ? "noopener,popup" : "noopener");
          return;
        }
        if (onActivate) onActivate();
        else router.push(href);
      },

      // Middle-click fires `auxclick`, never `click`.
      onAuxClick: (event) => {
        if (event.button !== 1 || hitsOwnControl(event)) return;
        event.preventDefault();
        window.open(href, "_blank", "noopener");
      },

      // Suppress the browser's own middle-button gesture (autoscroll on Windows,
      // paste-and-go on X11) so it can't fight the new-tab open above.
      onMouseDown: (event) => {
        if (event.button === 1 && !hitsOwnControl(event)) event.preventDefault();
      },
    }),
    [router],
  );
}
