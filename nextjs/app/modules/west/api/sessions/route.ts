import { NextResponse } from 'next/server';
import { getAllWorkoutSessions, createWorkoutSession } from '../../lib/workoutSessionFunctions';

export async function GET() {
  try {

    const sessions = await getAllWorkoutSessions();
    return NextResponse.json(sessions);

  } catch (error) {
    console.error('Error in GET /api/sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workout sessions' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { name, sessionDate } = await request.json();

    const id = await createWorkoutSession(name, sessionDate);
    return NextResponse.json({ id }, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/sessions:', error);
    return NextResponse.json(
      { error: 'Failed to create workout session' },
      { status: 500 }
    );
  }
}
