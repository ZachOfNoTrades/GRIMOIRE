"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

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

// Derive the browser tab title from the pathname, matching the existing
// "Module · Page" convention (e.g. the Forage nutrition route already shipped
// "Forage · Nutrition"). The dashboard keeps the bare brand; module home pages
// collapse to just the module name; deeper routes append their page segments.
export function deriveTitle(pathname: string): string {
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
    // Module landing page (".../ui/home") reads as just the module.
    const pageParts = rest.filter((s) => s !== "home" && !isIdSegment(s));
    if (pageParts.length === 0) return moduleLabel;
    return [moduleLabel, ...pageParts.map(slugToLabel)].join(" · ");
  }

  // OTHER TOP-LEVEL ROUTES (settings, auth, etc.) — drop "ui"/id segments.
  const parts = segments.filter((s) => s !== "ui" && !isIdSegment(s));
  if (parts.length === 0) return "Grimoire";
  return parts.map(slugToLabel).join(" · ");
}

// Renders nothing — a side-effect component mounted once in the root layout that
// keeps document.title in sync with the current route. Lives client-side because
// the bulk of the app's pages are client components and therefore cannot export
// Next's server-side `metadata`. Runs on every client navigation via usePathname.
export default function DocumentTitleSync() {
  const pathname = usePathname();

  useEffect(() => {
    const next = deriveTitle(pathname ?? "/");
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
  }, [pathname]);

  return null;
}
