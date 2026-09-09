// The study session's 1-4 rating scale, in one place: its labels, its badge classes
// and its chart colors. Client-safe (no DB imports) so the charts and modals can
// share it rather than each keeping a private copy of the same four-way switch.

export const RATING_SCALE = [1, 2, 3, 4] as const;

// Worst to best, matching the order the study session lays its rating buttons out
// and the order the deck history's rating bar stacks its segments.
export const RATING_LABELS: Record<number, string> = {
  1: "Again",
  2: "Hard",
  3: "Good",
  4: "Easy",
};

export function ratingLabel(rating: number): string {
  return RATING_LABELS[rating] ?? String(rating);
}

// Design-system badge class per rating (red → blue, worst to best).
export function ratingBadgeClass(rating: number): string {
  if (rating === 1) return "badge-red";
  if (rating === 2) return "badge-yellow";
  if (rating === 3) return "badge-green";
  return "badge-blue";
}

// Chart fills for the same four steps — the alert tokens the study session's own
// progress bar uses, so a red run means the same thing in a chart as it did while
// studying. Token references, never literal colors.
//
// NB: these four are an established product palette, not one chosen for the charts.
// Green and yellow sit close enough that a red-green-colorblind reader can't
// separate them by hue alone, so every chart built on them carries a second
// encoding — a labelled axis position, a legend, and a hover readout with the
// exact tally — and never asks color to carry identity by itself.
export const RATING_CHART_COLORS: Record<number, string> = {
  1: "var(--alert-red-text)",
  2: "var(--alert-yellow-text)",
  3: "var(--alert-green-text)",
  4: "var(--alert-blue-text)",
};
