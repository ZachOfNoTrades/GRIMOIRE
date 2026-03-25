import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { getAllExercises, getAllExercisesWithMuscleGroups, createExercise } from '../../lib/exerciseFunctions';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const include = request.nextUrl.searchParams.get('include');

    if (include === 'muscles') {
      const exercises = await getAllExercisesWithMuscleGroups(userId!);
      return NextResponse.json(exercises);
    }

    const showDisabled = request.nextUrl.searchParams.get('showDisabled') === 'true';
    const search = request.nextUrl.searchParams.get('search') || undefined;
    const page = request.nextUrl.searchParams.get('page') ? parseInt(request.nextUrl.searchParams.get('page')!) : undefined;
    const pageSize = request.nextUrl.searchParams.get('pageSize') ? parseInt(request.nextUrl.searchParams.get('pageSize')!) : undefined;

    const result = await getAllExercises(userId!, { showDisabled, search, page, pageSize });
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
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json();
    const { name, description, category, isTimed } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Exercise name is required' },
        { status: 400 }
      );
    }

    const exercise = await createExercise(userId!, name.trim(), description?.trim() || null, category || 'Strength', !!isTimed);
    return NextResponse.json(exercise, { status: 201 });

  } catch (error: any) {
    // Unique constraint violation (duplicate name)
    if (error?.number === 2627 || error?.number === 2601) {
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
