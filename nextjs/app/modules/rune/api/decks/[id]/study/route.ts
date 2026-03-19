import { NextResponse } from 'next/server';
import { createStudySession } from '../../../../lib/studyFunctions';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sessionId = await createStudySession(id);
    return NextResponse.json({ sessionId }, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/decks/[id]/study:', error);
    return NextResponse.json(
      { error: 'Failed to create study session' },
      { status: 500 }
    );
  }
}
