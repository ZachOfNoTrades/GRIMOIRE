import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getAllExercises, getAllExercisesWithMuscleGroups, createExercise, DUPLICATE_EXERCISE_NAME_ERROR } from '../../lib/exerciseFunctions';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const include = request.nextUrl.searchParams.get('include');
    // Enabled state is per-location — an optional location id scopes the enabled list.
    const locationId = request.nextUrl.searchParams.get('location') || undefined;

    if (include === 'muscles') {
      const exercises = await getAllExercisesWithMuscleGroups(userId!, locationId);
      return NextResponse.json(exercises);
    }

    const showDisabled = request.nextUrl.searchParams.get('showDisabled') === 'true';
    const search = request.nextUrl.searchParams.get('search') || undefined;
    const page = request.nextUrl.searchParams.get('page') ? parseInt(request.nextUrl.searchParams.get('page')!) : undefined;
    const pageSize = request.nextUrl.searchParams.get('pageSize') ? parseInt(request.nextUrl.searchParams.get('pageSize')!) : undefined;

    const result = await getAllExercises(userId!, { locationId, showDisabled, search, page, pageSize });
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in GET /api/exercises:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exercises' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json();
    const { name, description, category, isTimed, distanceType } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Exercise name is required' },
        { status: 400 }
      );
    }

    // Only 'short' / 'long' are valid distance modalities; anything else means no distance tracking.
    const normalizedDistanceType = (distanceType === 'short' || distanceType === 'long') ? distanceType : null;

    const exercise = await createExercise(userId!, name.trim(), description?.trim() || null, category || 'Strength', !!isTimed, normalizedDistanceType);
    return NextResponse.json(exercise, { status: 201 });

  } catch (error: any) {
    // Duplicate name — either the app-level cross-scope guard (system vs custom) or a DB unique-index violation.
    if (error?.message === DUPLICATE_EXERCISE_NAME_ERROR || error?.number === 2627 || error?.number === 2601) {
      return NextResponse.json(
        { error: 'An exercise with this name already exists' },
        { status: 409 }
      );
    }

    console.error('Error in POST /api/exercises:', error);
    return NextResponse.json(
      { error: 'Failed to create exercise' },
      { status: 500 }
    );
  }
}
