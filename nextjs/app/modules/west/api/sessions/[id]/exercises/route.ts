import { NextResponse } from 'next/server';
import { getSessionExercisesAndTargets, updateSessionExercises } from '../../../../lib/sessionExerciseFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const { exercises, targets } = await getSessionExercisesAndTargets(id);

    return NextResponse.json({ exercises, targets });

  } catch (error) {
    console.error('Error in GET /api/sessions/[id]/exercises:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session exercises' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const exercises = await request.json();

    await updateSessionExercises(id, exercises);

    // Return the updated exercises with targets
    const { exercises: updatedExercises, targets } = await getSessionExercisesAndTargets(id);

    return NextResponse.json({ exercises: updatedExercises, targets });

  } catch (error) {
    console.error('Error in PUT /api/sessions/[id]/exercises:', error);
    return NextResponse.json(
      { error: 'Failed to update session exercises' },
      { status: 500 }
    );
  }
}
