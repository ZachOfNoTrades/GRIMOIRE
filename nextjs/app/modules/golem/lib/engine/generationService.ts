// Server-side orchestration for engine-driven session generation: resolve the day archetype, load its
// slots, assemble candidate pools + per-exercise history, run the selection+loading engine, and return
// both the persistence segments and the human-readable plan. Composed by the generate-engine API route.
import { getDayArchetypeIdForSession, getSlotDefinitions, getCandidatesForMuscle, getCandidatesByCategory } from './generationLoader';
import { getRecentTopSet, getE1rmSeries } from './loader';
import { getActiveLocation, getActiveWarmupLocation } from '../locationFunctions';
import { generateDay } from './orchestrator';
import type { ExerciseHistory, GeneratedSlot } from './orchestrator';
import type { ScoringCandidate } from './selection';
import { DEFAULT_WEIGHTS } from './selection';
import { generatedSlotsToSegments } from './toSegments';
import type { GeneratedSegment } from '../../types/segment';

export interface EngineGenerationResult {
  segments: GeneratedSegment[];
  plan: GeneratedSlot[];
}

// Generate a session's targets deterministically. Throws if the session has no day archetype assigned
// (the engine generates against a day archetype's slots — assign one first).
export async function generateSessionTargetsWithEngine(
  userId: string,
  sessionId: string,
): Promise<EngineGenerationResult> {
  const dayArchetypeId = await getDayArchetypeIdForSession(userId, sessionId);
  if (!dayArchetypeId) {
    throw new Error(`Session '${sessionId}' has no day archetype assigned — assign one to generate with the engine`);
  }

  const slotDefinitions = await getSlotDefinitions(userId, dayArchetypeId);

  // The governing (working) location — its equipment + enabled-exercise list constrain every
  // non-warmup slot's candidate pool. No active location set → no location-based filtering (permissive).
  const activeLocation = await getActiveLocation(userId).catch(() => null);
  const locationId = activeLocation?.id ?? null;

  // Warmup slots draw their exercises from the active warmup location when one is set, else the working
  // location (the same fallback the LLM path uses) — resolved once and reused for every warmup slot.
  const activeWarmupLocation = await getActiveWarmupLocation(userId).catch(() => null);
  const warmupLocationId = activeWarmupLocation?.id ?? locationId;

  // Candidate pool per slot, in parallel. Muscle-targeted slots draw from primary movers for that muscle;
  // muscle-less slots (conditioning / Cardio, or generic isolation with no target muscle) fall back to the
  // whole category pool so they aren't dropped for want of a candidate (the conditioning-vanishes bug).
  // Warmup slots select by the same muscle/category rules but from the WARMUP location — a warmup slot is
  // "pick a {Mobility|Cardio|…} exercise from my warmup place", emitted as a warmup segment downstream.
  const candidatesBySlotIndex: ScoringCandidate[][] = await Promise.all(
    slotDefinitions.map((d) => {
      const slotLocationId = d.isWarmup ? warmupLocationId : locationId;
      return d.slot.targetMuscle
        ? getCandidatesForMuscle(userId, d.slot.targetMuscle, slotLocationId)
        : getCandidatesByCategory(userId, d.slot.categoryFilter, slotLocationId);
    }),
  );

  // Per-exercise history for every unique candidate (needed at prescription time), in parallel.
  const uniqueIds = Array.from(new Set(candidatesBySlotIndex.flat().map((c) => c.exerciseId)));
  const histories = await Promise.all(
    uniqueIds.map(async (exerciseId) => {
      const [topSet, e1rmSeries] = await Promise.all([
        getRecentTopSet(userId, exerciseId),
        getE1rmSeries(userId, exerciseId),
      ]);
      return [exerciseId, { topSet, e1rmSeries }] as [string, ExerciseHistory];
    }),
  );
  const historyByExerciseId = new Map<string, ExerciseHistory>(histories);

  // Volume-gap priors: real MEV/MRV landmarks aren't crisp yet (plan §7), so use a neutral prior per
  // target muscle for v1. (Swap for derived landmarks once structured probing produces them.)
  const volumeGapByMuscle = new Map<string, number>();
  for (const d of slotDefinitions) if (d.slot.targetMuscle) volumeGapByMuscle.set(d.slot.targetMuscle, 0.5);

  const plan = generateDay(slotDefinitions, candidatesBySlotIndex, historyByExerciseId, {
    volumeGapByMuscle,
    noveltyTriggered: false, // v1: demand triggers (staleness/plateau) wired in a later pass
    weights: DEFAULT_WEIGHTS,
    freshnessHalfLifeDays: 28,
    continuityTargetSessions: 5,
  });

  // Stamp the originating archetype onto each segment (provenance link shown in the segment modal).
  const segments = generatedSlotsToSegments(plan).map((s) => ({ ...s, day_archetype_id: dayArchetypeId }));
  return { segments, plan };
}
