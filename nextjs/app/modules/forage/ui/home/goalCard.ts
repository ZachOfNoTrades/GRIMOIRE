import { Goal } from "../../types/goal";
import { WeightEntry } from "../../types/weight";
import { weightTrendSeries } from "./weightTrend";

/* ─── GOAL CARD ───
   The dashboard's fourth insight card used to be a hardcoded placeholder: it
   was titled "Goal Progress", subtitled "Last 3 Days", and actually plotted
   today's kcal as a percentage of today's target — a number that has nothing
   to do with the user's goal and reads as 0% every morning before the first
   entry. Worse, it claimed progress toward a goal for users on `maintain`,
   where there is no destination to progress toward.

   The card now derives from the ACTIVE GOAL, and its shape follows the goal:

     • maintain            → how well weight is being held, as drift from the
                             weight when the goal started against a tolerance band
     • lose/gain + target  → real progress: share of the baseline → target
                             distance already covered
     • lose/gain, no target→ pace: the achieved lb/wk against the goal's rate

   Everything is measured on the SMOOTHED weight series (weightTrend.ts), not
   raw weigh-ins, so a heavy morning doesn't redraw the card — the same
   normalization the Weight Trend card reads from. */

// Maintenance holds inside this much drift; at the band edge the bar is empty.
// Wider than WEIGHT_TOLERANCE_LB (0.5 lb, single-reading scale noise) because
// this is a multi-week hold, where normal water/glycogen swing is larger.
export const MAINTENANCE_BAND_LB = 2;

// onTrack / offTrack drive the bar color; none = not enough data to judge.
export type GoalCardTone = "onTrack" | "offTrack" | "none";

export interface GoalCardSummary {
  title: string;
  subtitle: string;
  value: string;
  valueUnit: string;
  // Bar fill, 0–100.
  pct: number;
  tone: GoalCardTone;
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Signed, with the same U+2212 minus the expenditure/weight labels use.
function signed(n: number, digits = 1): string {
  const rounded = Number(n.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(digits)}`;
}

// Drops a trailing ".0" so "0.5 lb/wk" and "1 lb/wk" both read cleanly.
function trim(n: number): string {
  return Number(n.toFixed(2)).toString();
}

export function goalCardSummary(goal: Goal | null, weighIns: WeightEntry[]): GoalCardSummary {
  if (goal == null) {
    return { title: "Goal Progress", subtitle: "No active goal", value: "—", valueUnit: "", pct: 0, tone: "none" };
  }
  const isMaintain = goal.goal_kind === "maintain";

  // One smoothed value per calendar day, oldest first — so the goal's start
  // index and the day count come straight off the array, no date math.
  const series = weightTrendSeries(weighIns);
  const goalStartIso = goal.created_at.slice(0, 10);
  const baseIdx = series.findIndex((point) => point.date >= goalStartIso);
  const days = baseIdx === -1 ? 0 : series.length - 1 - baseIdx;

  // A goal needs two days of weigh-ins on either side of its start before any
  // of these readings mean anything; until then the card says so rather than
  // reporting a confident 0.
  if (baseIdx === -1 || days < 1) {
    return {
      title: isMaintain ? "Maintenance" : "Goal Progress",
      subtitle: goal.target_weight_lb != null ? `→ ${trim(goal.target_weight_lb)} lb` : "Awaiting weigh-ins",
      value: "—",
      valueUnit: "",
      pct: 0,
      tone: "none",
    };
  }

  const baseline = series[baseIdx].value;
  const current = series[series.length - 1].value;
  const moved = current - baseline; // signed lb since the goal started

  // MAINTAIN — no destination, so "progress" is how much of the tolerance band
  // is still unspent. Full bar = dead on the starting weight.
  if (isMaintain) {
    const within = Math.abs(moved) <= MAINTENANCE_BAND_LB;
    return {
      title: "Maintenance",
      subtitle: `±${MAINTENANCE_BAND_LB} lb band · ${days}d`,
      value: signed(moved),
      valueUnit: "lb drift",
      pct: clampPct((1 - Math.abs(moved) / MAINTENANCE_BAND_LB) * 100),
      tone: within ? "onTrack" : "offTrack",
    };
  }

  // LOSE / GAIN WITH A TARGET WEIGHT — share of the baseline → target distance
  // covered. Signed division handles both directions: moving away from the
  // target is negative and clamps to an empty bar.
  if (goal.target_weight_lb != null) {
    const span = goal.target_weight_lb - baseline;
    const pct = Math.abs(span) < 0.05 ? 100 : clampPct((moved / span) * 100);
    return {
      title: "Goal Progress",
      subtitle: `→ ${trim(goal.target_weight_lb)} lb`,
      value: `${pct}`,
      valueUnit: "%",
      pct,
      tone: pct > 0 ? "onTrack" : "offTrack",
    };
  }

  // LOSE / GAIN WITHOUT A TARGET WEIGHT — nothing to progress toward, so the
  // card grades PACE: achieved lb/wk against the rate the goal asked for.
  const ratePerWeek = (moved / days) * 7;
  const goalRate = (goal.rate_lb_per_week ?? 0) * (goal.goal_kind === "lose" ? -1 : 1);
  const pct = goalRate === 0 ? 0 : clampPct((ratePerWeek / goalRate) * 100);
  return {
    title: "Goal Pace",
    subtitle: `Goal ${trim(Math.abs(goalRate))} lb/wk`,
    value: signed(ratePerWeek),
    valueUnit: "lb/wk",
    pct,
    tone: pct >= 50 ? "onTrack" : "offTrack",
  };
}
