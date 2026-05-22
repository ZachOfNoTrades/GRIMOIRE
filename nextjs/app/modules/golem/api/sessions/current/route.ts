import { NextResponse } from 'next/server';
import { getAuthorizedConnection } from '@/lib/permissions';
import { getCurrentWorkoutSession } from '../../../lib/workoutSessionFunctions';

export async function GET() {
  try {
    const authSession = await getAuthorizedConnection();
    if (!authSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = authSession.user.id;

    const session = await getCurrentWorkoutSession(userId!);

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
