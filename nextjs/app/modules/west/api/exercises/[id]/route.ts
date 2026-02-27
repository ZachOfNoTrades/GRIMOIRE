import { NextRequest, NextResponse } from 'next/server';
import { getExerciseById, updateExercise, disableExercise, enableExercise } from '../../../lib/exerciseFunctions';
import { getExerciseMuscleGroups, updateExerciseMuscleGroups } from '../../../lib/muscleGroupFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const exercise = await getExerciseById(id);
    const muscleGroups = await getExerciseMuscleGroups(id);
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
    const { id } = await context.params;
    const body = await request.json();
    const { name, description, muscleGroups } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Exercise name is required' },
        { status: 400 }
      );
    }

    await updateExercise(id, name.trim(), description?.trim() || null);

    // Update muscle groups if provided
    if (muscleGroups !== undefined) {
      await updateExerciseMuscleGroups(id, muscleGroups);
    }

    // Re-fetch exercise with muscle groups
    const updatedExercise = await getExerciseById(id);
    const updatedMuscleGroups = await getExerciseMuscleGroups(id);
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
    const { id } = await context.params;

    await disableExercise(id);
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
    const { id } = await context.params;

    await enableExercise(id);
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
