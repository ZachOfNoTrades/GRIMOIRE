// SPANNING-BAR LANE ASSIGNMENT
//
// A grace-window occurrence (window_days > 1) is drawn as ONE bar: the lead cell renders a chip
// widened to cover the days it crosses, and every following cell renders a hidden spacer whose only
// job is to hold that bar's lane so the chips underneath don't slide up into it.
//
// That contract only holds if a bar occupies the SAME lane index in every cell of its week row.
// Ordering the chips per-cell can't guarantee that: on a day where a 1-day-remaining continuation
// meets a freshly-starting 2-day bar, any cell-local sort (by length, by title, …) is free to rank
// them differently than the cell before, and the continuation loses its lane — or, once the sort
// pushes it past the cell's chip budget, is dropped entirely and the bar from the previous cell
// paints straight over whatever took lane 0.
//
// So lanes are assigned ONCE PER WEEK ROW, the way a real calendar packs events: earliest segment
// first, each taking the lowest lane that is free for every day it covers. The result is a lane per
// occurrence that every cell in the row agrees on.
// One occurrence clipped to the week row it is being drawn in.
export interface RowSpan {
  key: string;
  segStart: string; // first day of the occurrence WITHIN this row (YYYY-MM-DD)
  segEnd: string; // last day of the occurrence within this row
}

// Greedy interval packing over a single week row. Segments are the row-clipped extents (a bar that
// runs off either end of the row is cut to the row), so lanes reset on each row — which is exactly
// what the rendering does too.
export function assignSpanLanes(segs: RowSpan[]): Map<string, number> {
  const lanes = new Map<string, number>();
  // Lowest-lane-first packing needs a deterministic order, and "earliest start" is the one that
  // keeps a bar above the bars that begin later — i.e. a continuation stays on top of a new arrival.
  // Ties: the longer bar first (it constrains more days), then the key, so the order never depends
  // on which cell asked.
  const ordered = [...segs].sort(
    (a, b) =>
      a.segStart.localeCompare(b.segStart) ||
      b.segEnd.localeCompare(a.segEnd) ||
      a.key.localeCompare(b.key),
  );
  // occupied[lane] = the segments already placed there; a lane is free for a segment when none of
  // them overlaps it.
  const occupied: RowSpan[][] = [];
  for (const seg of ordered) {
    let lane = 0;
    while (
      occupied[lane]?.some((s) => s.segStart <= seg.segEnd && seg.segStart <= s.segEnd)
    ) {
      lane += 1;
    }
    (occupied[lane] ??= []).push(seg);
    lanes.set(seg.key, lane);
  }
  return lanes;
}

// A chip's lane identity: one occurrence of one task. Two occurrences of the same task can't share
// a row-lane, so the start date has to be part of the key.
export function spanKey(taskId: string, occStart: string): string {
  return `${taskId}:${occStart}`;
}

// Lay the day's chips out by lane: each spanning chip at the lane its row assigned it, every gap
// below the last occupied lane filled with an invisible placeholder so the lanes line up, and the
// single-day chips stacked underneath.
// `makeFiller` builds the placeholder in whatever chip shape the caller renders.
export function layoutByLane<T>(
  spanning: { chip: T; lane: number }[],
  singles: T[],
  makeFiller: (lane: number) => T,
): T[] {
  if (spanning.length === 0) return singles;
  const byLane: (T | undefined)[] = [];
  for (const { chip, lane } of spanning) {
    // A row's lanes are unique per overlapping segment, so a collision can only come from stale
    // input; drop it to the next free lane rather than silently losing a chip.
    let l = lane;
    while (byLane[l] !== undefined) l += 1;
    byLane[l] = chip;
  }
  const out: T[] = [];
  for (let l = 0; l < byLane.length; l++) out.push(byLane[l] ?? makeFiller(l));
  return out.concat(singles);
}
