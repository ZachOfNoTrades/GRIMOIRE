import { NextResponse } from 'next/server';
import { getAllWorkoutSessions } from '../../lib/workoutSessionFunctions';

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
