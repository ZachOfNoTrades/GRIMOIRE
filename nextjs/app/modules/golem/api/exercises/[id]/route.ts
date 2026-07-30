import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getExerciseById, updateExercise, disableExercise, enableExercise, getExerciseEquipment, setExerciseEquipment } from '../../../lib/exerciseFunctions';
import { getExerciseMuscleGroups, updateExerciseMuscleGroups } from '../../../lib/muscleGroupFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;
    // is_disabled reflects the enabled list of this location (defaults to active/default).
    const locationId = new URL(request.url).searchParams.get('location') || undefined;

    const exercise = await getExerciseById(userId!, id, locationId);
    const muscleGroups = await getExerciseMuscleGroups(id);
    const equipment = await getExerciseEquipment(id);
    return NextResponse.json({ ...exercise, muscleGroups, equipment });

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
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;
    const body = await request.json();
    const { name, description, category, isTimed, distanceType, muscleGroups, equipment } = body;

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

    // Only 'short' / 'long' are valid distance modalities; anything else means no distance tracking.
    const normalizedDistanceType = (distanceType === 'short' || distanceType === 'long') ? distanceType : null;

    await updateExercise(userId!, id, name.trim(), description?.trim() || null, category, !!isTimed, normalizedDistanceType);

    // Update muscle groups if provided
    if (muscleGroups !== undefined) {
      await updateExerciseMuscleGroups(id, muscleGroups);
    }

    // Update equipment if provided (array of equipment ids)
    if (equipment !== undefined) {
      await setExerciseEquipment(id, Array.isArray(equipment) ? equipment : []);
    }

    // Re-fetch exercise with muscle groups + equipment
    const updatedExercise = await getExerciseById(userId!, id);
    const updatedMuscleGroups = await getExerciseMuscleGroups(id);
    const updatedEquipment = await getExerciseEquipment(id);
    return NextResponse.json({ ...updatedExercise, muscleGroups: updatedMuscleGroups, equipment: updatedEquipment });

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
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;
    // Disable this exercise at the given location (defaults to active/default).
    const locationId = new URL(request.url).searchParams.get('location') || undefined;

    await disableExercise(userId!, id, locationId);
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
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;
    // Enable this exercise at the given location (defaults to active/default).
    const locationId = new URL(request.url).searchParams.get('location') || undefined;

    await enableExercise(userId!, id, locationId);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in PATCH /api/exercises/[id]:', error);

    if (error instanceof Error && error.message.includes('No exercise found')) {
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
