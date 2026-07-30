import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getCalculatedVolumeLandmarks } from '../../../lib/volumeLandmarkFunctions';

export async function GET(request: Request) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const landmarks = await getCalculatedVolumeLandmarks(userId!);
    return NextResponse.json(landmarks);

  } catch (error) {
    console.error('Error in GET /api/volume/landmarks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch volume landmarks' },
      { status: 500 }
    );
  }
}
