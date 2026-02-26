import { NextResponse } from 'next/server';
import { getSessionExercisesBySessionId } from '../../../../lib/sessionExerciseFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const sessionExercises = await getSessionExercisesBySessionId(id);
    return NextResponse.json(sessionExercises);

  } catch (error) {
    console.error('Error in GET /api/sessions/[id]/exercises:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session exercises' },
      { status: 500 }
    );
  }
}
