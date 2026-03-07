import { NextResponse } from 'next/server';
import { getWorkoutSessionById, updateWorkoutSession, deleteWorkoutSession, resetWorkoutSession } from '../../../lib/workoutSessionFunctions';

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
    const { name, description, review, analysis, started_at, resumed_at, duration, is_current, is_completed } = await request.json();

    await updateWorkoutSession(id, name, description, review, analysis, started_at, resumed_at, duration, is_current, is_completed);

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    await resetWorkoutSession(id);

    // Return the updated session
    const updatedSession = await getWorkoutSessionById(id);
    return NextResponse.json(updatedSession);

  } catch (error) {
    console.error('Error in PATCH /api/sessions/[id]:', error);

    if (error instanceof Error && error.message.includes('No workout session found')) {
      return NextResponse.json(
        { error: 'Workout session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to reset workout session' },
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

    await deleteWorkoutSession(id);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in DELETE /api/sessions/[id]:', error);

    if (error instanceof Error && error.message.includes('No workout session found')) {
      return NextResponse.json(
        { error: 'Workout session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete workout session' },
      { status: 500 }
    );
  }
}
