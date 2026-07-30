import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getWeeklyVolumeByMuscleGroup } from '../../../lib/volumeLandmarkFunctions';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const weekId = request.nextUrl.searchParams.get('weekId');
    if (!weekId) {
      return NextResponse.json(
        { error: 'weekId query parameter is required' },
        { status: 400 }
      );
    }

    const volume = await getWeeklyVolumeByMuscleGroup(userId!, weekId);
    return NextResponse.json(volume);

  } catch (error) {
    console.error('Error in GET /api/volume/weekly:', error);
    return NextResponse.json(
      { error: 'Failed to fetch weekly volume' },
      { status: 500 }
    );
  }
}
