import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getWorkoutSessionById } from '../../../../lib/workoutSessionFunctions';
import { createExercise } from '../../../../lib/exerciseFunctions';
import { createGeneratedTargets } from '../../../../lib/segmentFunctions';
import { SuggestedExercise, GeneratedSegment } from '../../../../types/segment';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authSession = await getAuthorizedUser(request);
    if (!authSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = authSession.user.id;
    const { id: sessionId } = await context.params;

    // Verify session exists and belongs to user
    await getWorkoutSessionById(userId!, sessionId);

    const body = await request.json();
    const { exercises } = body as { exercises: SuggestedExercise[] };

    if (!Array.isArray(exercises) || exercises.length === 0) {
      return NextResponse.json({ error: 'No exercises provided' }, { status: 400 });
    }

    // Create each exercise and build target segments
    const targetSegments: GeneratedSegment[] = [];

    for (const suggestion of exercises) {
      // Create the exercise in the database
      const newExercise = await createExercise(
        userId!,
        suggestion.name.trim(),
        suggestion.description?.trim() || null,
        suggestion.category || 'Strength',
        suggestion.is_timed || false,
      );

      // Build a target segment using the new exercise ID
      targetSegments.push({
        exercise_id: newExercise.id,
        modifier_id: suggestion.modifier_id,
        order_index: suggestion.order_index,
        is_warmup: suggestion.is_warmup,
        sets: suggestion.sets,
      });
    }

    // Save the target segments for this session
    await createGeneratedTargets(userId!, sessionId, targetSegments);

    return NextResponse.json({
      created: targetSegments.length,
      exerciseIds: targetSegments.map(t => t.exercise_id),
    });

  } catch (error: any) {
    if (error?.message?.includes('No workout session found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    // Handle duplicate exercise name
    if (error?.number === 2627 || error?.number === 2601) {
      return NextResponse.json(
        { error: 'An exercise with that name already exists' },
        { status: 409 }
      );
    }

    console.error('Error in POST /api/sessions/[id]/accept-suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to create exercises from suggestions' },
      { status: 500 }
    );
  }
}
