import { NextResponse } from 'next/server';
import { getCurrentWorkoutSession } from '../../../lib/workoutSessionFunctions';

export async function GET() {
  try {

    const session = await getCurrentWorkoutSession();

    if (!session) {
      return NextResponse.json(null);
    }

    return NextResponse.json(session);

  } catch (error) {
    console.error('Error in GET /api/sessions/current:', error);
    return NextResponse.json(
      { error: 'Failed to fetch current workout session' },
      { status: 500 }
    );
  }
}
