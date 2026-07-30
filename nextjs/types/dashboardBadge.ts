// Badges shown on the homepage module cards ("what needs attention in this module right now").
// Each module contributes its own list from its own DB (app/modules/<slug>/lib/badgeFunctions.ts);
// lib/dashboardBadges.ts fans out and GET /api/dashboard/badges serves the merged map.

// Maps onto the .badge-<tone> palette in globals.css.
export type BadgeTone = "red" | "yellow" | "green" | "blue" | "gray";

export interface ModuleBadge {
  // Stable identifier for the badge kind (React key + a hook for tests). Unique per module.
  key: string;
  // Short display text — these sit on a 2-up mobile grid, so keep them a couple of words.
  label: string;
  tone: BadgeTone;
  // Longer explanation, surfaced as the title attribute / screen-reader text.
  detail: string;
}

// Keyed by module slug (golem / rune / quest / forage). Modules with nothing due are omitted.
export type ModuleBadgeMap = Record<string, ModuleBadge[]>;
