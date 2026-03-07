import { NextRequest, NextResponse } from 'next/server';
import { getExerciseHistory } from '../../../../lib/exerciseFunctions';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const startDate = request.nextUrl.searchParams.get('startDate') || undefined;
    const endDate = request.nextUrl.searchParams.get('endDate') || undefined;

    const { history, totalCount } = await getExerciseHistory(id, { startDate, endDate });

    return NextResponse.json({ history, totalCount });

  } catch (error) {
    console.error('Error in GET /api/exercises/[id]/history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exercise history' },
      { status: 500 }
    );
  }
}
