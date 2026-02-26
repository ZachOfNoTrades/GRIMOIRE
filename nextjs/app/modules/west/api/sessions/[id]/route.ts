import { NextResponse } from 'next/server';
import { getWorkoutSessionById, updateWorkoutSession } from '../../../lib/workoutSessionFunctions';

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

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { name, notes } = await request.json();

    await updateWorkoutSession(id, name, notes);

    // Return the updated session
    const updatedSession = await getWorkoutSessionById(id);
    return NextResponse.json(updatedSession);

  } catch (error) {
    console.error('Error in PUT /api/sessions/[id]:', error);

    if (error instanceof Error && error.message.includes('No workout session found')) {
      return NextResponse.json(
        { error: 'Workout session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update workout session' },
      { status: 500 }
    );
  }
}
