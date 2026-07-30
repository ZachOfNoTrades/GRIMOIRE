import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { logGeneration } from '@/lib/generationLimit';
import { getWorkoutSessionById } from '../../../../lib/workoutSessionFunctions';
import { createGeneratedTargets, deleteAllTargetsForSession } from '../../../../lib/segmentFunctions';
import { generateSessionTargetsWithEngine } from '../../../../lib/engine/generationService';

// Deterministic, engine-driven generation. Unlike the LLM route this is synchronous — the engine runs in
// well under a second — so it returns the generated plan directly (no job/polling).
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authSession = await getAuthorizedUser(request);
    if (!authSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = authSession.user.id;

    const { id } = await context.params;

    // Verify session exists (throws → 404 below)
    await getWorkoutSessionById(userId!, id);

    // Run the deterministic engine (selection scorer + loading engine)
    const { segments, plan } = await generateSessionTargetsWithEngine(userId!, id);

    if (segments.length === 0) {
      return NextResponse.json({ error: 'Engine produced no targets — check the day archetype slots' }, { status: 422 });
    }

    // Replace existing targets with the freshly generated ones
    await deleteAllTargetsForSession(userId!, id);
    await createGeneratedTargets(userId!, id, segments);

    await logGeneration(userId!, '/modules/golem/api/sessions/generate-engine');

    return NextResponse.json({
      success: true,
      generated: plan.map((s) => ({
        role: s.slotRole,
        exercise: s.exerciseName,
        sets: s.working.length,
        reps: s.working[0]?.reps ?? null,
        weight: s.working[0]?.weight ?? null,
        timeSeconds: s.working[0]?.timeSeconds ?? null,
        rationale: s.rationale,
        baseline: s.isBaseline,
      })),
    }, { status: 200 });

  } catch (error: any) {
    if (error?.message?.includes('No workout session found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error?.message?.includes('no day archetype assigned')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error in POST /api/sessions/[id]/generate-engine:', error);
    return NextResponse.json({ error: 'Failed to generate session exercises (engine)' }, { status: 500 });
  }
}
