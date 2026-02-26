import { NextResponse } from 'next/server';
import { getAllExercises } from '../../lib/exerciseFunctions';

export async function GET() {
  try {

    const exercises = await getAllExercises();
    return NextResponse.json(exercises);

  } catch (error) {
    console.error('Error in GET /api/exercises:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exercises' },
      { status: 500 }
    );
  }
}
