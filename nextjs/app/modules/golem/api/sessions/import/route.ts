import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { importWorkoutHistory } from '../../../lib/importFunctions';
import { ImportPayload } from '../../../types/import';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body: ImportPayload = await request.json();

    if (!body.sessions || body.sessions.length === 0) {
      return NextResponse.json(
        { error: 'No sessions provided' },
        { status: 400 }
      );
    }

    const result = await importWorkoutHistory(userId!, body);
    return NextResponse.json(result, { status: 201 });

  } catch (error: any) {
    // Unique constraint violation
    if (error?.number === 2627 || error?.number === 2601) {
      return NextResponse.json(
        { error: 'Duplicate constraint violation during import' },
        { status: 409 }
      );
    }

    console.error('Error in POST /api/sessions/import:', error);
    return NextResponse.json(
      { error: 'Failed to import workout history' },
      { status: 500 }
    );
  }
}
