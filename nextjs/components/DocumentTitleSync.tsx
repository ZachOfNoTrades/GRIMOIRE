"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

// Turn a route slug ("pre-workout", "data_input") into a tab-friendly label
// ("Pre Workout", "Data Input"). Dashes and underscores become spaces and each
// word is capitalized.
function slugToLabel(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// A path segment is an entity id (GUID or numeric primary key) rather than a
// named route folder. We drop these from the title — "Golem · Session" reads
// better than "Golem · Session · 90c27ba2-…" and we don't have the entity's
// name on the client anyway.
function isIdSegment(segment: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$/.test(segment) || /^\d+$/.test(segment);
}

// ENTITY TITLE OVERRIDE — a detail route showing one record ("…/decks/<id>") wants
// its tab to name that record ("Rune · Anatomy 101") rather than the route folder
// it lives under, which would otherwise read exactly like the list page it came from
// ("Rune · Decks"). The record's name only exists on the client, after that page
// fetches it, so the page registers it here and this component picks it up.
//
// A module-scoped store rather than context: the only consumers are leaf pages and
// this component, so a provider in the root layout would be plumbing for nothing.
// Entries are keyed by pathname so a label left behind by the page we just navigated
// away from can never be applied to the route that replaced it.
type EntityTitle = { pathname: string; label: string };

let entityTitle: EntityTitle | null = null;
const listeners = new Set<() => void>();

function emitEntityTitle() {
  for (const listener of listeners) listener();
}

function subscribeEntityTitle(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getEntityTitle(): EntityTitle | null {
  return entityTitle;
}

// Server render has no store — the title is derived from the pathname alone until
// the page hydrates and fetches its record.
function getServerEntityTitle(): EntityTitle | null {
  return null;
}

// Call from a detail page with the record's name (null/empty while it is still
// loading, which leaves the plain route-derived title in place rather than
// flashing a blank one). Clears itself when the page unmounts.
export function useEntityTitle(label: string | null | undefined): void {
  const pathname = usePathname();

  useEffect(() => {
    const trimmed = label?.trim();
    if (!trimmed) return;
    const current = pathname ?? "/";
    entityTitle = { pathname: current, label: trimmed };
    emitEntityTitle();
    return () => {
      // Only clear OUR entry. On a route change React can run this cleanup after the
      // next page has already registered its own label, and clearing unconditionally
      // would wipe it.
      if (entityTitle?.pathname === current) {
        entityTitle = null;
        emitEntityTitle();
      }
    };
  }, [pathname, label]);
}

// Derive the browser tab title from the pathname, matching the existing
// "Module · Page" convention (e.g. the Forage nutrition route already shipped
// "Forage · Nutrition"). The dashboard keeps the bare brand; module home pages
// collapse to just the module name; deeper routes append their page segments.
// `entityLabel` (from useEntityTitle) names the record a detail route is showing and
// takes the place of its id segment.
export function deriveTitle(pathname: string, entityLabel?: string | null): string {
  const segments = pathname.split("/").filter(Boolean);

  // ROOT / DASHBOARD — keep the plain brand.
  if (segments.length === 0 || (segments.length === 1 && segments[0] === "dashboard")) {
    return "Grimoire";
  }

  // MODULE ROUTES — /modules/<slug>/ui/<page...>.
  if (segments[0] === "modules" && segments[1]) {
    const moduleLabel = slugToLabel(segments[1]);
    // Everything after the module slug; drop the structural "ui" segment.
    let rest = segments.slice(2);
    if (rest[0] === "ui") rest = rest.slice(1);
    // DETAIL ROUTE WITH A NAMED RECORD — the record's name stands in for its id
    // segment, and the collection segment ahead of it ("Decks") is dropped: the name
    // is the more specific label and "Rune · Decks · Anatomy 101" is just noise.
    // Segments AFTER the id are kept, so a sub-page still reads as a sub-page.
    if (entityLabel) {
      const idIndex = rest.findIndex(isIdSegment);
      const tail = idIndex < 0 ? [] : rest.slice(idIndex + 1).filter((s) => !isIdSegment(s));
      return [moduleLabel, entityLabel, ...tail.map(slugToLabel)].join(" · ");
    }
    // Module landing page (".../ui/home") reads as just the module.
    const pageParts = rest.filter((s) => s !== "home" && !isIdSegment(s));
    if (pageParts.length === 0) return moduleLabel;
    return [moduleLabel, ...pageParts.map(slugToLabel)].join(" · ");
  }

  // OTHER TOP-LEVEL ROUTES (settings, auth, etc.) — drop "ui"/id segments.
  const parts = segments.filter((s) => s !== "ui" && !isIdSegment(s));
  if (entityLabel) {
    const idIndex = segments.findIndex(isIdSegment);
    // Same rule as the module branch: everything up to (but not including) the
    // collection segment that owns the id, then the record's own name.
    const lead = idIndex < 0 ? parts : segments.slice(0, idIndex).filter((s) => s !== "ui" && !isIdSegment(s)).slice(0, -1);
    return [...lead.map(slugToLabel), entityLabel].join(" · ");
  }
  if (parts.length === 0) return "Grimoire";
  return parts.map(slugToLabel).join(" · ");
}

// Renders nothing — a side-effect component mounted once in the root layout that
// keeps document.title in sync with the current route. Lives client-side because
// the bulk of the app's pages are client components and therefore cannot export
// Next's server-side `metadata`. Runs on every client navigation via usePathname.
export default function DocumentTitleSync() {
  const pathname = usePathname();
  const entity = useSyncExternalStore(subscribeEntityTitle, getEntityTitle, getServerEntityTitle);
  // Guard against a label registered for a route we have already left (the store is
  // pathname-keyed precisely so this check is possible).
  const entityLabel = entity && entity.pathname === (pathname ?? "/") ? entity.label : null;

  useEffect(() => {
    const next = deriveTitle(pathname ?? "/", entityLabel);
    const apply = () => {
      if (document.title !== next) document.title = next;
    };
    apply();
    // On a hard load Next flushes the route's resolved metadata <title> a beat
    // AFTER hydration (and pages without their own metadata inherit the root
    // "Grimoire"), which would clobber the line above. A useEffect only runs once
    // per pathname, so instead we watch <head> and re-assert our route-derived
    // title whenever anything rewrites it. The `!==` guard makes our own write a
    // no-op, so the observer can't loop. Disconnected on unmount / route change.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [pathname, entityLabel]);

  return null;
}
