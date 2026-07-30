// Intelligent exercise selection (plan §6): scored, constrained assignment — NOT recycling.
// Hard filters eliminate ineligible candidates; a weighted score ranks the rest; novelty is
// demand-driven (only when a staleness/plateau trigger fires), so we neither mindlessly recycle
// nor mindlessly rotate. Pure functions; types-only import (harness-loadable).
// NOTE: roleFit below is really MUSCLE-fit (does the candidate hit the slot's target muscle). The
// separate archetypeFit dimension ensures the pick also fits the SLOT'S ROLE — the archetype's
// expression of intent (primary = main compound lift, isolation = single-joint, unilateral = single-limb)
// — so a slot isn't filled by an exercise that merely matches the muscle but not the role (e.g. a Leg
// Extension landing in a "primary" compound slot). archetypeFit is derived from existing data only
// (muscle-recruitment breadth for compound/isolation; unilateral inferred from the exercise name) — no
// new exercise-attribute columns (plan §7 user pref). Fatigue coefficient remains DEFERRED.

// A candidate exercise the scorer can evaluate (assembled from loader + muscle-group data).
export interface ScoringCandidate {
  exerciseId: string;
  name: string;
  category: string;              // 'Strength' | 'Cardio' | 'Mobility' — hard filter
  primaryMuscles: string[];      // muscle group names where this exercise is a primary mover
  allMuscles: string[];          // primary + secondary, for complementarity overlap
  daysSinceUsed: number | null;  // null = never used by this user
  historySessions: number;       // recent sessions that included it (continuity / loading confidence)
  equipmentAvailable: boolean;   // pre-resolved against the governing location
  isTimed?: boolean;             // logged by duration (is_timed) — must match a slot's timed requirement
}

// The slot being filled (subset of day_slots relevant to selection).
export interface SlotSpec {
  role: string;
  targetMuscle: string | null;          // primary target driving role-fit + volume-gap
  categoryFilter: string;               // hard filter
  rotationCadence: 'never' | 'per_block' | 'per_session';
  pinnedExerciseId: string | null;      // specificity slots (never / per_block)
  excludeExerciseIds: string[];         // dedup: exercises already chosen this day/week
  contraindicatedMuscles?: string[];    // hard-exclude any candidate recruiting one of these (injury, or day_slots.excluded_muscles → movement-pattern constraint, e.g. exclude 'Lower Back' to demand a leg-curl over a hinge)
  requiredMuscles?: string[];           // hard-require: candidate must ALSO recruit ALL of these (day_slots.required_muscles → e.g. a Shoulders slot requiring 'Triceps' demands an overhead press, not a face pull/lateral raise)
  requireTimed?: boolean;               // true = only is_timed exercises (time_effort); false = only rep-based; undefined = any
}

export interface SelectionWeights {
  roleFit: number;       // muscle-fit: candidate is a (primary) mover for the slot's target muscle
  archetypeFit: number;  // role-fit: candidate's nature (compound/isolation/unilateral) suits the slot's role
  volumeGap: number;
  complementarity: number;
  novelty: number;
  continuity: number;
}

// Accumulation-block default weights (plan §6). Powerlifting/HIIT presets differ; tuned per program/block later.
export const DEFAULT_WEIGHTS: SelectionWeights = {
  roleFit: 0.3,
  archetypeFit: 0.15,
  volumeGap: 0.15,
  complementarity: 0.13,
  novelty: 0.07,
  continuity: 0.2,
};

// Exercises whose name signals a single-limb (unilateral) movement. Inferred from the name because we
// don't store a unilateral attribute (plan §7 forgoes new exercise columns); modifiers aren't on the
// candidate. Coarse but high-precision — used only to fit "unilateral" slots, never as a hard filter.
const UNILATERAL_NAME = /\b(single[- ]?(arm|leg)|one[- ]?(arm|legged|leg)|1[- ]?(arm|leg)|unilateral|bulgarian|split[- ]?squat|lunge|pistol|step[- ]?up)\b/i;

function isUnilateralExercise(name: string): boolean {
  return UNILATERAL_NAME.test(name);
}

// How well a candidate's intrinsic nature fits the slot's ROLE (the archetype's intent), 0..1.
// Compoundness comes from muscle-recruitment breadth: a single-muscle exercise is isolation (0), a
// 4+-muscle exercise is a big compound (1). Roles whose intent is already governed by the category
// filter / target muscle (core, carry, conditioning) stay near-neutral so this dimension doesn't fight them.
function archetypeFitForRole(role: string, candidate: ScoringCandidate): number {
  const breadth = candidate.allMuscles.length || candidate.primaryMuscles.length || 1;
  const compoundness = Math.min(1, Math.max(0, (breadth - 1) / 3)); // 1 muscle → 0, 4+ → 1
  const isolationness = 1 - compoundness;
  switch (role) {
    case 'primary':      return compoundness;                          // main compound lift
    case 'secondary':    return 0.5 + 0.3 * compoundness;             // accessory: mild compound lean, stays flexible
    case 'isolation':    return isolationness;                         // single-joint work
    case 'unilateral':   return isUnilateralExercise(candidate.name) ? 1 : 0.3; // single-limb movement
    case 'carry':        return 0.6 + 0.2 * compoundness;             // loaded carries are whole-body
    case 'core':         return 0.7;                                   // target muscle already constrains it
    case 'conditioning': return 0.7;                                   // category filter governs it
    default:             return 0.6;
  }
}

export interface SelectionContext {
  volumeGapByMuscle: Map<string, number>; // 0..1 — how under-served the muscle is (1 = needs work most)
  alreadyChosenMuscleSets: string[][];     // muscle sets of earlier picks this session (complementarity)
  noveltyTriggered: boolean;               // staleness/plateau active for this slot → novelty pressure on
  weights: SelectionWeights;
  freshnessHalfLifeDays: number;           // recency scaling (default 28)
  continuityTargetSessions: number;        // history depth for full continuity credit (default 5)
}

export interface ScoredCandidate {
  candidate: ScoringCandidate;
  score: number;                 // -Infinity = hard-filtered out
  breakdown: Record<string, number>;
}

// Jaccard overlap between two muscle sets (0 = disjoint, 1 = identical).
function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let inter = 0;
  for (const x of new Set(a)) if (setB.has(x)) inter++;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

// Hard filters: category mismatch, dedup, equipment, contraindication. Returns a reason if excluded.
function hardFilterReason(candidate: ScoringCandidate, slot: SlotSpec): string | null {
  if (candidate.category !== slot.categoryFilter) return 'category';
  if (slot.excludeExerciseIds.includes(candidate.exerciseId)) return 'dedup';
  // Timed requirement: time_effort slots need duration-logged exercises; rep-based slots exclude them
  // (a rep prescription on a timed-only exercise can't be logged). undefined = no constraint.
  if (slot.requireTimed === true && !candidate.isTimed) return 'requires_timed';
  if (slot.requireTimed === false && candidate.isTimed) return 'requires_reps';
  if (!candidate.equipmentAvailable) return 'equipment';
  if (slot.contraindicatedMuscles && slot.contraindicatedMuscles.some((m) => candidate.allMuscles.includes(m)))
    return 'contraindicated';
  if (slot.requiredMuscles && !slot.requiredMuscles.every((m) => candidate.allMuscles.includes(m)))
    return 'requires_muscle';
  return null;
}

// Score one candidate for one slot. Higher is better; -Infinity means hard-filtered.
export function scoreCandidate(
  candidate: ScoringCandidate,
  slot: SlotSpec,
  ctx: SelectionContext,
): ScoredCandidate {
  const filtered = hardFilterReason(candidate, slot);
  if (filtered) return { candidate, score: -Infinity, breakdown: { filtered: 0, reason: 0 } };

  const w = ctx.weights;

  // Role fit: primary mover for the target muscle = full credit; secondary = partial; otherwise none.
  let roleFit = 0;
  if (slot.targetMuscle === null) roleFit = 1;
  else if (candidate.primaryMuscles.includes(slot.targetMuscle)) roleFit = 1;
  else if (candidate.allMuscles.includes(slot.targetMuscle)) roleFit = 0.4;

  // Archetype fit: does the candidate's nature (compound/isolation/unilateral) suit the slot's role?
  // This is what makes a pick "fit within the archetype" rather than merely matching the target muscle.
  const archetypeFit = archetypeFitForRole(slot.role, candidate);

  // Volume gap: how much the target muscle still needs work this week (prior-based until landmarks are crisp).
  const volumeGap = slot.targetMuscle ? ctx.volumeGapByMuscle.get(slot.targetMuscle) ?? 0.5 : 0.5;

  // Complementarity: penalize overlap with what earlier slots already cover (diverse stimulus where it matters).
  let maxOverlap = 0;
  for (const chosen of ctx.alreadyChosenMuscleSets) maxOverlap = Math.max(maxOverlap, jaccard(candidate.allMuscles, chosen));
  const complementarity = 1 - maxOverlap;

  // Novelty: demand-driven. Only rewards freshness when a staleness/plateau trigger is active for the slot;
  // otherwise neutral, so we DON'T rotate for rotation's sake (the anti-recycling guarantee).
  let novelty = 0.5;
  if (ctx.noveltyTriggered) {
    const days = candidate.daysSinceUsed ?? ctx.freshnessHalfLifeDays * 3; // never-used = very fresh
    novelty = Math.min(1, days / (ctx.freshnessHalfLifeDays * 2)); // staler/unused → higher
  }

  // Continuity: history depth = confidence to progress this exercise. Favors keeping what we can load well.
  const continuity = Math.min(1, candidate.historySessions / ctx.continuityTargetSessions);

  const breakdown = {
    roleFit: w.roleFit * roleFit,
    archetypeFit: w.archetypeFit * archetypeFit,
    volumeGap: w.volumeGap * volumeGap,
    complementarity: w.complementarity * complementarity,
    novelty: w.novelty * novelty,
    continuity: w.continuity * continuity,
  };
  const score = Object.values(breakdown).reduce((s, v) => s + v, 0);
  return { candidate, score, breakdown };
}

// Pick the best candidate for a slot. Pinned (specificity) slots short-circuit to the pinned exercise
// when present and eligible; otherwise the highest score wins. Returns null if nothing is eligible.
export function selectForSlot(
  candidates: ScoringCandidate[],
  slot: SlotSpec,
  ctx: SelectionContext,
): ScoredCandidate | null {
  // Specificity: a never/per_block slot keeps its pinned exercise (re-anchor handles load), unless contraindicated.
  if (slot.pinnedExerciseId && slot.rotationCadence !== 'per_session') {
    const pinned = candidates.find((c) => c.exerciseId === slot.pinnedExerciseId);
    if (pinned && hardFilterReason(pinned, { ...slot, excludeExerciseIds: [] }) === null) {
      return { candidate: pinned, score: Infinity, breakdown: { pinned: 1 } };
    }
  }

  let best: ScoredCandidate | null = null;
  for (const c of candidates) {
    const scored = scoreCandidate(c, slot, ctx);
    if (scored.score === -Infinity) continue;
    if (!best || scored.score > best.score) best = scored;
  }
  return best;
}
