import { NextResponse } from 'next/server';
import { getWorkoutSessionById } from '../../../lib/workoutSessionFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const session = await getWorkoutSessionById(id);
    return NextResponse.json(session);

  } catch (error) {
    console.error('Error in GET /api/sessions/[id]:', error);

    if (error instanceof Error && error.message.includes('No workout session found')) {
      return NextResponse.json(
        { error: 'Workout session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch workout session' },
      { status: 500 }
    );
  }
}
