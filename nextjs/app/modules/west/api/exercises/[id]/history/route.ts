import { NextResponse } from 'next/server';
import { getExerciseHistory } from '../../../../lib/exerciseFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const history = await getExerciseHistory(id);

    return NextResponse.json(history);

  } catch (error) {
    console.error('Error in GET /api/exercises/[id]/history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exercise history' },
      { status: 500 }
    );
  }
}
