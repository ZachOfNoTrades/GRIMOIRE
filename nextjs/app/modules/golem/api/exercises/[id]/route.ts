import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { getExerciseById, updateExercise, disableExercise, enableExercise } from '../../../lib/exerciseFunctions';
import { getExerciseMuscleGroups, updateExerciseMuscleGroups } from '../../../lib/muscleGroupFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;

    const exercise = await getExerciseById(userId!, id);
    const muscleGroups = await getExerciseMuscleGroups(userId!, id);
    return NextResponse.json({ ...exercise, muscleGroups });

  } catch (error) {
    console.error('Error in GET /api/exercises/[id]:', error);

    if (error instanceof Error && error.message.includes('No exercise found')) {
      return NextResponse.json(
        { error: 'Exercise not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch exercise' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;
    const body = await request.json();
    const { name, description, category, isTimed, muscleGroups } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Exercise name is required' },
        { status: 400 }
      );
    }

    if (!category) {
      return NextResponse.json(
        { error: 'Exercise category is required' },
        { status: 400 }
      );
    }

    await updateExercise(userId!, id, name.trim(), description?.trim() || null, category, !!isTimed);

    // Update muscle groups if provided
    if (muscleGroups !== undefined) {
      await updateExerciseMuscleGroups(userId!, id, muscleGroups);
    }

    // Re-fetch exercise with muscle groups
    const updatedExercise = await getExerciseById(userId!, id);
    const updatedMuscleGroups = await getExerciseMuscleGroups(userId!, id);
    return NextResponse.json({ ...updatedExercise, muscleGroups: updatedMuscleGroups });

  } catch (error: any) {
    console.error('Error in PUT /api/exercises/[id]:', error);

    if (error instanceof Error && error.message.includes('No exercise found')) {
      return NextResponse.json(
        { error: 'Exercise not found' },
        { status: 404 }
      );
    }

    // Unique constraint violation (duplicate name)
    if (error?.number === 2627 || error?.number === 2601) {
      return NextResponse.json(
        { error: 'An exercise with this name already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update exercise' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;

    await disableExercise(userId!, id);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in DELETE /api/exercises/[id]:', error);

    if (error instanceof Error && error.message.includes('No exercise found')) {
      return NextResponse.json(
        { error: 'Exercise not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to disable exercise' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;

    await enableExercise(userId!, id);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in PATCH /api/exercises/[id]:', error);

    if (error instanceof Error && error.message.includes('No disabled exercise found')) {
      return NextResponse.json(
        { error: 'Exercise not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to enable exercise' },
      { status: 500 }
    );
  }
}
