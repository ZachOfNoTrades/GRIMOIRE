import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { createStudySession } from '../../../../lib/studyFunctions';
import { requireDeckAccess, deckAccessErrorResponse } from '../../../../lib/shareFunctions';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;

    const access = await requireDeckAccess({ id: userId!, email: session.user.email }, id, 'view');

    const sessionId = await createStudySession(userId!, id);
    return NextResponse.json({ sessionId }, { status: 201 });

  } catch (error) {
    const accessResponse = deckAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

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
