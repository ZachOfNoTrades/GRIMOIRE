import { NextResponse } from 'next/server';
import { generateNextWeek } from '../../../../../../lib/weekGenerationFunctions';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; weekId: string }> }
) {
  try {
    const { id, weekId } = await context.params;

    await generateNextWeek(id, weekId);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in POST /api/programs/[id]/weeks/[weekId]/generate:', error);

    if (error instanceof Error && error.message.includes('No week found')) {
      return NextResponse.json(
        { error: 'Week not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate next week' },
      { status: 500 }
    );
  }
}
