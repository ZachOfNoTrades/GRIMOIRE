import { NextRequest, NextResponse } from 'next/server';
import { getAllExercises, createExercise } from '../../lib/exerciseFunctions';

export async function GET(request: NextRequest) {
  try {

    const includeDisabled = request.nextUrl.searchParams.get('includeDisabled') === 'true';
    const exercises = await getAllExercises(includeDisabled);
    return NextResponse.json(exercises);

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

    const body = await request.json();
    const { name, description } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Exercise name is required' },
        { status: 400 }
      );
    }

    const exercise = await createExercise(name.trim(), description?.trim() || null);
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
