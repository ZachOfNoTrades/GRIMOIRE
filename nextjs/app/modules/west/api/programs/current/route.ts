import { NextResponse } from 'next/server';
import { getCurrentProgramId, getProgramById } from '../../../lib/programFunctions';

export async function GET() {
  try {
    const currentProgramId = await getCurrentProgramId();

    if (!currentProgramId) {
      return NextResponse.json(
        { error: 'No current program found' },
        { status: 404 }
      );
    }

    const program = await getProgramById(currentProgramId);
    return NextResponse.json(program);

  } catch (error) {
    console.error('Error in GET /api/programs/current:', error);
    return NextResponse.json(
      { error: 'Failed to fetch current program' },
      { status: 500 }
    );
  }
}
