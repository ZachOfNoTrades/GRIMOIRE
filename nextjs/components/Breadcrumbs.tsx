"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buildTrail } from "@/lib/breadcrumbs";

type BreadcrumbsProps = {
  // Names the record a detail route is showing, so the last crumb reads
  // "Anatomy 101" instead of the collection's singular ("Deck").
  label?: string | null;
  // Extra classes on the <nav>, for pages that need their own spacing.
  className?: string;
  // Runs instead of navigating on a plain left-click, for pages that must do
  // something first (discard-changes prompt, ending a study session, cleaning up
  // a draft). The page owns the navigation from there. Never runs for new-tab
  // clicks, which leave the current page and its state untouched.
  onNavigate?: (href: string) => void;
  // A crumb for where the page was opened from, inserted before the current page. Settings pages
  // are reached from several places and their address says nothing about which, so without this
  // the only way back to a campaign is the browser's Back button.
  parent?: { label: string; href: string } | null;
};

// BREADCRUMBS — the top-of-page trail ("Home / Rune / Collections"), one link per
// ancestor and plain text for the page you are on. Replaces the old single "Back"
// control, whose destination depended on history and so could cycle between two
// pages instead of ever moving up.
export default function Breadcrumbs({ label, className, onNavigate, parent }: BreadcrumbsProps) {
  const pathname = usePathname();
  const trail = buildTrail(pathname ?? "/", label);
  const crumbs = parent ? [...trail.slice(0, -1), { label: parent.label, href: parent.href }, ...trail.slice(-1)] : trail;

  return (
    // TRAIL
    <nav aria-label="Breadcrumb" className={className ? `breadcrumbs ${className}` : "breadcrumbs"}>
      {crumbs.map((crumb, index) => (
        // CRUMB
        <span key={`${crumb.label}-${index}`} className="breadcrumb-item">

          {/* SEPARATOR — between crumbs only, and hidden from screen readers,
              which get the list structure from the nav label instead. */}
          {index > 0 && (
            <span className="breadcrumb-separator" aria-hidden="true">/</span>
          )}

          {/* LABEL — a real <Link> for ancestors so middle-click / cmd-click can
              open them in a new tab; plain text for the current page. */}
          {crumb.href ? (
            <Link
              href={crumb.href}
              className="breadcrumb-link"
              onClick={(event) => {
                if (!onNavigate) return;

                // Modified / non-primary clicks are the browser's to handle (new
                // tab, new window) — leave them alone.
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
                onNavigate(crumb.href as string);
              }}
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="breadcrumb-current" aria-current="page">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export { Breadcrumbs };
