import { NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { getAllMuscleGroups } from '../../lib/muscleGroupFunctions';

export async function GET() {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const muscleGroups = await getAllMuscleGroups();
    return NextResponse.json(muscleGroups);

  } catch (error) {
    console.error('Error in GET /api/muscle-groups:', error);
    return NextResponse.json(
      { error: 'Failed to fetch muscle groups' },
      { status: 500 }
    );
  }
}
