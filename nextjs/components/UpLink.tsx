"use client";

import Link from "next/link";

type UpLinkProps = Omit<React.ComponentPropsWithoutRef<typeof Link>, "href"> & {
  // The parent route. Always the destination — this control never consults history.
  href: string;
  // Runs instead of navigating on a plain left-click, for pages that must do
  // something first (cleaning up a disposable draft, ending an in-page session).
  // The page owns the navigation from there. Never runs for new-tab clicks, which
  // leave the current page and its state untouched.
  onNavigate?: () => void;
};

// UP LINK — the single-icon "up one level" control, for the handful of headers with
// no room for a full breadcrumb trail (a locked editor bar, a centered-title row, the
// phone calendar toolbar). Every other page uses <Breadcrumbs> instead.
//
// Replaced the old history-aware BackLink: that one popped browser history whenever the
// previous route was in the same module, so bouncing between two pages made Back cycle
// between them instead of ever moving up. This always goes to `href`.
export function UpLink({ href, onNavigate, onClick, children, ...rest }: UpLinkProps) {
  return (
    // UP ANCHOR — a real <Link> so middle-click / cmd-click opens the parent in a new tab.
    <Link
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (!onNavigate) return;

        // Modified / non-primary clicks are the browser's to handle (new tab, new
        // window, download) — leave them alone.
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
        onNavigate();
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}

export default UpLink;
