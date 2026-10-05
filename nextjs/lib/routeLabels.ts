// Route-segment label helpers, shared by the browser-tab title (DocumentTitleSync)
// and the page breadcrumb trail (lib/breadcrumbs.ts) so the two never disagree
// about what a route segment is called.

// Turn a route slug ("pre-workout", "data_input") into a readable label
// ("Pre Workout", "Data Input"). Dashes and underscores become spaces and each
// word is capitalized.
export function slugToLabel(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// A path segment is an entity id (GUID or numeric primary key) rather than a
// named route folder.
export function isIdSegment(segment: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F-]+$/.test(segment) || /^\d+$/.test(segment);
}
