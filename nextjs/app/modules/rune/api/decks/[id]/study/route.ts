import { NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { createStudySession } from '../../../../lib/studyFunctions';
import { getDeckById } from '../../../../lib/deckFunctions';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;

    // Verify deck ownership
    await getDeckById(userId!, id);

    const sessionId = await createStudySession(userId!, id);
    return NextResponse.json({ sessionId }, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/decks/[id]/study:', error);

    if (error instanceof Error && error.message.includes('No deck found')) {
      return NextResponse.json(
        { error: 'Deck not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create study session' },
      { status: 500 }
    );
  }
}
