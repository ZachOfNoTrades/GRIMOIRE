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
  missingEquipment?: string[];   // required equipment NOT registered at that location — names the equipment gate's cause
  isTimed?: boolean;             // logged by duration (is_timed) — must match a slot's timed requirement
  typicalTimeSeconds?: number | null; // mean logged duration for THIS user (null = never logged timed work)
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
  timeRange?: [number, number] | null;   // authored dose for a timed slot — also drives duration fit below
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

// A carry is LOADED LOCOMOTION: gait under an external load, with the bracing and offset trunk demand
// that comes with it. That is a narrow, consistently-named movement class, so a carry slot requires a
// positive match on the carry vocabulary rather than merely excluding obvious holds.
//
// A negative test was tried first (exclude hangs/holds/planks) and was not enough: the pool for a
// Forearms-targeted carry is ~40 curls and two hangs, so removing the hangs simply handed the slot to a
// Reverse Dumbbell Curl. Requiring the movement to actually BE a carry is the honest constraint.
//
// The exclusion list covers words that appear inside carry vocabulary but negate it — "Drag Curl" is a
// curl, "Farmer's Hold" is a static hold, not a walk.
const CARRY_NAME = /\b(carry|carries|farmer.?s?|yoke|suitcase|waiter|ruck|prowler|sled|drag|death march)\b/i;
const NOT_A_CARRY_NAME = /\b(curl|hold|hang|plank|pinch|isometric)\b/i;

function isLoadedCarry(name: string): boolean {
  return CARRY_NAME.test(name) && !NOT_A_CARRY_NAME.test(name);
}


// Scaled-DOWN variants: the same movement made easier so it can be trained by someone who cannot yet do
// the full version. Perfectly good exercises — just not the MAIN lift of a day. A primary slot asking for
// a chest compound wants a bench press or a dip, not a wall push-up. Name-inferred with the same caveat as
// UNILATERAL_NAME (coarse, never a hard filter); applied only as a score penalty, and only to the roles
// that mean "this is the hard part of the session".
//
// "half-/tall-kneeling" is a stance descriptor, not a regression, so it is explicitly exempted.
const REGRESSION_NAME = /\b(against (the )?wall|wall push|(?<!half[- ])(?<!tall[- ])kneeling|assisted|negative|eccentric[- ]only|incline push[- ]?up|box push[- ]?up|partial|half[- ]rep|modified)\b/i;

function isRegressionVariant(name: string): boolean {
  return REGRESSION_NAME.test(name);
}

// How well the DOSE being asked for matches the duration this exercise is actually trained at, 0..1.
//
// A conditioning slot is only ever "pick something from the Cardio pool", so a 30-second interval and a
// 45-minute aerobic block drew from exactly the same candidates and scored them identically — which is how
// a 30-minute continuous Jump Rope came out of an aerobic-base slot. The user's own logging already says
// what each modality is for: jump rope shows up in 3-minute pieces, the treadmill in 20-minute ones.
//
// Scored on the LOG ratio, so being 2x off costs the same whether it is twice as long or half as long, and
// an exercise never trained for time is simply neutral rather than penalised.
function durationFit(slot: SlotSpec, candidate: ScoringCandidate): number {
  const typical = candidate.typicalTimeSeconds;
  if (!slot.timeRange || typical == null || typical <= 0) return 1; // nothing to compare — stay neutral

  const target = (slot.timeRange[0] + slot.timeRange[1]) / 2;
  if (target <= 0) return 1;

  const octavesOff = Math.abs(Math.log2(typical / target));
  return 0.55 + 0.45 * (1 / (1 + octavesOff)); // exact match 1.0, 2x off ~0.78, 8x off ~0.61
}

// How well a candidate's intrinsic nature fits the slot's ROLE (the archetype's intent), 0..1.
// Compoundness comes from muscle-recruitment breadth: a single-muscle exercise is isolation (0), a
// 4+-muscle exercise is a big compound (1). Roles whose intent is already governed by the category
// filter / target muscle (core, carry, conditioning) stay near-neutral so this dimension doesn't fight them.
function archetypeFitForRole(slot: SlotSpec, candidate: ScoringCandidate): number {
  const role = slot.role;
  const breadth = candidate.allMuscles.length || candidate.primaryMuscles.length || 1;
  const compoundness = Math.min(1, Math.max(0, (breadth - 1) / 3)); // 1 muscle → 0, 4+ → 1
  const isolationness = 1 - compoundness;
  // A scaled-down variant can be a perfectly good accessory but is the wrong answer for the day's hard
  // work, and breadth alone cannot tell it apart from the full lift (a wall push-up recruits exactly the
  // same three muscles as a bench press, so both scored 0.10 and the tie went to whichever the database
  // listed first).
  const regressionPenalty = isRegressionVariant(candidate.name) ? 0.5 : 1;

  switch (role) {
    case 'primary':      return compoundness * regressionPenalty;      // main compound lift
    case 'secondary':    return (0.5 + 0.3 * compoundness) * regressionPenalty; // accessory: mild compound lean, stays flexible
    case 'isolation':    return isolationness;                         // single-joint work
    case 'unilateral':   return isUnilateralExercise(candidate.name) ? 1 : 0.3; // single-limb movement
    case 'core':         return 0.7 * durationFit(slot, candidate);   // target muscle already constrains it
    case 'conditioning': return 0.7 * durationFit(slot, candidate);   // category filter governs it
    case 'carry':        return (0.6 + 0.2 * compoundness) * durationFit(slot, candidate);
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

// What selectForSlot decided for one slot: the winning candidate (null = nothing eligible, slot drops)
// plus — when a pin didn't resolve cleanly — WHY, so the caller can surface it instead of swallowing it.
export interface SlotSelection {
  picked: ScoredCandidate | null;
  pinOutcome?: PinOutcome;
}

// Why a slot's pinned_exercise_id did NOT simply fill the slot. A pin is an explicit user override
// (it commonly encodes an injury constraint), so it must never be dropped in silence — every
// non-clean outcome carries one of these up to the caller, which surfaces it in the rationale.
//   honored: true  → the pin was emitted anyway despite the blocker (advisory blockers only, e.g.
//                    equipment missing at the location — usually a stale location equipment list).
//   honored: false → the blocker is a safety/loggability constraint (contraindication, hold, wrong
//                    category, timed-vs-reps) or the pin isn't in the pool at all, so the scorer
//                    substituted. The substitute is named by the caller.
export interface PinOutcome {
  pinnedExerciseId: string;
  pinnedExerciseName: string | null; // null when the pin isn't in the candidate pool (can't be named here)
  reason: string;                    // hard-filter code ('equipment' | 'contraindicated' | …) or 'not_in_pool'
  detail: string[];                  // what specifically blocked it (missing equipment / offending muscles)
  honored: boolean;
}

// Hard-filter codes that a pin is allowed to OVERRIDE. Equipment availability is a fact about the
// location's registered equipment list, not about the athlete — and that list is frequently stale, so
// silently swapping a deliberately-chosen lift for the scorer's favourite is worse than emitting the
// pin with a warning. Every other code (contraindicated, requires_muscle, requires_timed/reps,
// category) is a safety or loggability constraint and must win over the pin.
// 'not_a_carry' joins it: that filter encodes the ARCHETYPE'S INTENT for a carry slot, inferred from a
// name heuristic — not a fact about the athlete's safety or whether the result can be logged. A human who
// deliberately pins something else into a carry slot outranks the heuristic, and gets a warning saying so.
const PIN_OVERRIDABLE_REASONS = new Set(['equipment', 'not_a_carry']);

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
  // A carry slot must get an actual carry. archetypeFitForRole('carry') is near-neutral by design (the
  // target muscle is meant to govern), so on a Forearms-targeted carry slot a dead hang — and then, once
  // hangs were excluded, a dumbbell curl — out-scored the one real carry in the pool. No soft weight
  // survives a pool that is ~40 curls deep, so the constraint has to be hard.
  if (slot.role === 'carry' && !isLoadedCarry(candidate.name)) return 'not_a_carry';
  return null;
}

// The specifics behind a hard-filter code, so a dropped/overridden pin can name what actually blocked it
// ("missing equipment: Loop Bands") instead of an opaque code. Empty when the code has no list to give.
function hardFilterDetail(candidate: ScoringCandidate, slot: SlotSpec, reason: string): string[] {
  switch (reason) {
    case 'equipment':
      return candidate.missingEquipment ?? [];
    case 'contraindicated':
      return (slot.contraindicatedMuscles ?? []).filter((m) => candidate.allMuscles.includes(m));
    case 'requires_muscle':
      return (slot.requiredMuscles ?? []).filter((m) => !candidate.allMuscles.includes(m));
    default:
      return [];
  }
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
  const archetypeFit = archetypeFitForRole(slot, candidate);

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

// Scores are floats built from weighted components, so "equal" has to mean "equal within rounding".
const SCORE_EPSILON = 1e-9;

// Candidates frequently tie EXACTLY: inside a muscle-targeted pool every candidate is a primary mover
// (roleFit is 1 for all of them), volume gap is a property of the slot's target muscle rather than of the
// candidate, and on a cold start nobody has history, so novelty and continuity are flat too. Measured on
// the live catalog: 36 of 36 eligible Core candidates, and 29 of 44 Chest primaries, scored identically.
//
// Something still has to choose. Taking the first maximum means taking whatever order the database
// happened to return, which is why a single exercise could win the same slot in ten different archetypes.
// Instead, break the tie on a stable FNV-1a hash of the exercise id seeded by the slot's own identity:
// the pick is spread across the tied set, differs between slots, and is perfectly reproducible for a given
// slot — the engine stays deterministic, it just stops being biased toward one row.
function tieBreakKey(exerciseId: string, slot: SlotSpec): number {
  let h = 0x811c9dc5;
  const seed = `${exerciseId}|${slot.role}|${slot.targetMuscle ?? ''}|${slot.categoryFilter}`;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// Pick the best candidate for a slot. Pinned (specificity) slots short-circuit to the pinned exercise
// when present and eligible; otherwise the highest score wins. `picked` is null if nothing is eligible.
// A pin that couldn't be taken cleanly always reports a `pinOutcome` — pins are never dropped silently.
export function selectForSlot(
  candidates: ScoringCandidate[],
  slot: SlotSpec,
  ctx: SelectionContext,
): SlotSelection {
  // Specificity: a never/per_block slot keeps its pinned exercise (re-anchor handles load), unless
  // contraindicated. When the pin CAN'T be taken cleanly we never fall through in silence — a PinOutcome
  // rides along on the result so the caller can put the reason in front of the user (see PinOutcome).
  let pinOutcome: PinOutcome | undefined;
  if (slot.pinnedExerciseId && slot.rotationCadence !== 'per_session') {
    const pinned = candidates.find((c) => c.exerciseId === slot.pinnedExerciseId);

    // PIN NOT IN THE POOL — held (injury), disabled at this location, wrong category, or simply not a
    // primary mover for the slot's target muscle. Nothing to emit, so the scorer substitutes — loudly.
    if (!pinned) {
      pinOutcome = { pinnedExerciseId: slot.pinnedExerciseId, pinnedExerciseName: null, reason: 'not_in_pool', detail: [], honored: false };
    } else {
      // Dedup never blocks a pin (the pin IS the answer for this slot), so it's cleared before filtering.
      const reason = hardFilterReason(pinned, { ...slot, excludeExerciseIds: [] });
      if (reason === null) {
        return { picked: { candidate: pinned, score: Infinity, breakdown: { pinned: 1 } } };
      }
      const detail = hardFilterDetail(pinned, slot, reason);
      const honored = PIN_OVERRIDABLE_REASONS.has(reason);
      pinOutcome = { pinnedExerciseId: pinned.exerciseId, pinnedExerciseName: pinned.name, reason, detail, honored };

      // ADVISORY BLOCKER — emit the pin anyway. The user's explicit choice beats the scorer; the caller
      // surfaces the warning so a genuinely-unavailable lift is visible rather than quietly swapped.
      if (honored) {
        return { picked: { candidate: pinned, score: Infinity, breakdown: { pinned: 1 } }, pinOutcome };
      }
    }
  }

  let best: ScoredCandidate | null = null;
  let bestTie = 0;
  for (const c of candidates) {
    const scored = scoreCandidate(c, slot, ctx);
    if (scored.score === -Infinity) continue;
    const tie = tieBreakKey(c.exerciseId, slot);
    if (!best || scored.score > best.score + SCORE_EPSILON) {
      best = scored; bestTie = tie;
    } else if (Math.abs(scored.score - best.score) <= SCORE_EPSILON && tie > bestTie) {
      // Genuine tie — see tieBreakKey. Spread across the tied set instead of taking whatever came first.
      best = scored; bestTie = tie;
    }
  }
  return { picked: best, pinOutcome };
}
