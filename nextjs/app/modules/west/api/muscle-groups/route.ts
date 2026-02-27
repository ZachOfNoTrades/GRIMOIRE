import { NextResponse } from 'next/server';
import { getAllMuscleGroups } from '../../lib/muscleGroupFunctions';

export async function GET() {
  try {

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
