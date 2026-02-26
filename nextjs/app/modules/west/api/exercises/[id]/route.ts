import { NextResponse } from 'next/server';
import { getExerciseById } from '../../../lib/exerciseFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const exercise = await getExerciseById(id);
    return NextResponse.json(exercise);

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
