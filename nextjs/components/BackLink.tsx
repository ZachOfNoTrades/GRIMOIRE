"use client";

import Link from "next/link";
import { useBackHref, useGoBack } from "@/lib/useGoBack";

type BackLinkProps = Omit<React.ComponentPropsWithoutRef<typeof Link>, "href"> & {
  // Where Back lands when there is no same-module route to pop back to.
  fallback: string;
  // Replaces the default history-aware Back on a plain left-click, for pages that
  // need to do something first (discard-changes prompt, cleaning up a draft
  // record). When set, `fallback` IS the link target — no history pop — so the
  // new-tab destination matches where a left-click ends up. Never runs for
  // new-tab clicks, which leave the current page and its state untouched.
  onNavigate?: () => void;
};

// BACK LINK — the top-of-page "Back" control. Renders a real <Link> so that a
// middle-click or cmd/ctrl-click opens the destination in a new tab: a
// <button onClick> never receives a click event for the middle button at all, so
// those gestures silently did nothing. Plain left-click is intercepted and routed
// through useGoBack so history-aware Back behaviour (pop within the module,
// fallback across modules) is unchanged.
export function BackLink({ fallback, onNavigate, onClick, children, ...rest }: BackLinkProps) {
  const historyHref = useBackHref(fallback);
  const goBack = useGoBack();

  return (
    // BACK ANCHOR
    <Link
      href={onNavigate ? fallback : historyHref}
      onClick={(event) => {
        onClick?.(event);

        // Modified / non-primary clicks are the browser's to handle (new tab,
        // new window, download) — leave them alone.
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        event.preventDefault();
        if (onNavigate) onNavigate();
        else goBack(fallback);
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}

export default BackLink;
