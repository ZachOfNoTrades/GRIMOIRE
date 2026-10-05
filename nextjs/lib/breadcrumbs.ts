// BREADCRUMB TRAIL — derives "Home / Rune / Collections" from the current pathname.
//
// This replaces the old history-aware Back button (lib/useGoBack + components/BackLink).
// A Back button's destination depended on where you came from, so bouncing between two
// pages made Back cycle between them and there was no way up to a parent. A trail is a
// pure function of the URL: every ancestor is its own link, the current page is the last
// crumb and is never a link.
import { isIdSegment, slugToLabel } from "@/lib/routeLabels";

export type Crumb = {
  label: string;
  // null = the current page (rendered as plain text), or an ancestor segment that has
  // no page of its own to link to (see PAGE_ROUTES).
  href: string | null;
};

// SEGMENT LABEL OVERRIDES — only where slugToLabel gets it wrong. Everything else
// is titleized from the slug, so a new route needs no entry here.
const SEGMENT_LABELS: Record<string, string> = {
  "dashboard-customize": "Customize Dashboard",
  "config-preview": "Design Preview",
  "check-in": "Check-in",
};

// REAL PAGE ROUTES — every static (non-dynamic) page in the app. A crumb only becomes
// a link when its accumulated href is one of these, because several route folders are
// grouping-only and have no index page ("…/golem/ui/session", "…/settings/ui/user").
// A route missing from this set renders as plain text rather than a link, so forgetting
// to add a new page here degrades to an unclickable crumb, never a 404.
const PAGE_ROUTES = new Set<string>([
  "/dashboard",
  "/health/ui",
  "/modules/bagel/ui/history",
  "/modules/bagel/ui/home",
  "/modules/damnation/ui/history",
  "/modules/damnation/ui/home",
  "/modules/damnation/ui/settings",
  "/modules/forage/ui/dashboard-customize",
  "/modules/forage/ui/foods",
  "/modules/forage/ui/home",
  "/modules/forage/ui/library",
  "/modules/forage/ui/library/new",
  "/modules/forage/ui/nutrition",
  "/modules/forage/ui/recipes",
  "/modules/forage/ui/settings",
  "/modules/forage/ui/settings/check-in",
  "/modules/forage/ui/settings/data-input",
  "/modules/forage/ui/settings/favorites",
  "/modules/forage/ui/settings/home-badge",
  "/modules/forage/ui/settings/units",
  "/modules/forage/ui/strategy",
  "/modules/golem/ui/archetypes",
  "/modules/golem/ui/calendar",
  "/modules/golem/ui/engine/config",
  "/modules/golem/ui/engine/config-preview",
  "/modules/golem/ui/exercises",
  "/modules/golem/ui/history",
  "/modules/golem/ui/home",
  "/modules/golem/ui/locations",
  "/modules/golem/ui/profile",
  "/modules/golem/ui/programs/generate",
  "/modules/golem/ui/settings",
  "/modules/golem/ui/templates",
  "/modules/golem/ui/volume",
  "/modules/oracle/ui/home",
  "/modules/oracle/ui/settings",
  "/modules/quest/ui/calendar",
  "/modules/quest/ui/debug",
  "/modules/quest/ui/home",
  "/modules/quest/ui/settings",
  "/modules/rune/ui/collections",
  "/modules/rune/ui/decks",
  "/modules/rune/ui/decks/generate",
  "/modules/rune/ui/home",
  "/modules/rune/ui/settings",
  "/settings/ui/admin",
  "/settings/ui/home",
  "/settings/ui/theme",
]);

// GROUPING-SEGMENT ALIASES — a route folder that has no index page of its own, but
// whose contents ARE listed on some other page. Without an entry the crumb is plain
// text and the listing page is one hop further away than the old Back button was
// (the user list lives on the Admin page, not on Settings' landing page).
const ALIAS_ROUTES: Record<string, string> = {
  "/settings/ui/user": "/settings/ui/admin",
};

// Drop a trailing "s" so a record crumb with no name of its own still reads as one
// record ("Decks" -> "Deck") instead of repeating its collection.
function singular(label: string): string {
  return label.endsWith("s") ? label.slice(0, -1) : label;
}

function labelFor(segment: string): string {
  return SEGMENT_LABELS[segment] ?? slugToLabel(segment);
}

function linkFor(href: string): string | null {
  if (PAGE_ROUTES.has(href)) return href;
  return ALIAS_ROUTES[href] ?? null;
}

// Build the trail for a pathname. `recordLabel` names the record a detail route is
// showing ("Anatomy 101"), standing in for its opaque id segment; without it the crumb
// falls back to the singular of its collection ("Deck") rather than printing a GUID.
export function buildTrail(pathname: string, recordLabel?: string | null): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const named = recordLabel?.trim() || null;

  // ROOT / DASHBOARD — the top of the trail is also the current page.
  if (segments.length === 0 || (segments.length === 1 && segments[0] === "dashboard")) {
    return [{ label: "Home", href: null }];
  }

  const crumbs: Crumb[] = [{ label: "Home", href: "/dashboard" }];

  // SECTION CRUMB + the base the remaining segments hang off. Module routes are
  // /modules/<slug>/ui/<page...> and top-level settings is /settings/ui/<page...>;
  // the structural "ui" segment is never shown.
  let rest: string[];
  let base: string;
  if (segments[0] === "modules" && segments[1]) {
    const slug = segments[1];
    base = `/modules/${slug}/ui`;
    crumbs.push({ label: slugToLabel(slug), href: `${base}/home` });
    rest = segments.slice(2);
  } else if (segments[0] === "settings") {
    base = "/settings/ui";
    crumbs.push({ label: "Settings", href: "/settings/ui/home" });
    rest = segments.slice(1);
  } else {
    base = "";
    rest = segments;
  }
  if (rest[0] === "ui") rest = rest.slice(1);

  // A section's own landing page ("…/rune/ui/home") is the section crumb itself, so
  // there is nothing left to append — it just stops being a link.
  if (rest.length === 0 || (rest.length === 1 && rest[0] === "home")) {
    const last = crumbs[crumbs.length - 1];
    return [...crumbs.slice(0, -1), { label: named ?? last.label, href: null }];
  }

  rest.forEach((segment, index) => {
    const href = `${base}/${segment}`;
    base = href;
    const isLast = index === rest.length - 1;

    if (isIdSegment(segment)) {
      // An id segment has no readable slug: use the record's name when the page
      // supplied one, else the singular of the collection crumb ahead of it.
      const parent = crumbs[crumbs.length - 1];
      const label = (isLast && named) || singular(parent?.label ?? "Record");
      // "…/session/<id>" would otherwise read "Session / Session", because the
      // grouping segment is already singular. Take over that crumb instead.
      if (parent && parent.label === label) {
        crumbs[crumbs.length - 1] = { label, href: isLast ? null : href };
        return;
      }
      crumbs.push({ label, href: isLast ? null : href });
      return;
    }

    crumbs.push({
      label: isLast && named ? named : labelFor(segment),
      href: isLast ? null : linkFor(href),
    });
  });

  return crumbs;
}
