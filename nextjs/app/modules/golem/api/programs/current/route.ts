import { NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { getCurrentProgramId, getProgramById } from '../../../lib/programFunctions';

export async function GET() {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const currentProgramId = await getCurrentProgramId(userId!);

    if (!currentProgramId) {
      return NextResponse.json(
        { error: 'No current program found' },
        { status: 404 }
      );
    }

    const program = await getProgramById(userId!, currentProgramId);
    return NextResponse.json(program);

  } catch (error) {
    console.error('Error in GET /api/programs/current:', error);
    return NextResponse.json(
      { error: 'Failed to fetch current program' },
      { status: 500 }
    );
  }
}
