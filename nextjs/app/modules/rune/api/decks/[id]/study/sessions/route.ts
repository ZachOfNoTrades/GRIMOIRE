import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getDeckStudySessions } from '../../../../../lib/studyFunctions';
import { requireDeckAccess, deckAccessErrorResponse } from '../../../../../lib/shareFunctions';

export async function GET(
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

    const sessions = await getDeckStudySessions(userId!, id);
    return NextResponse.json(sessions);

  } catch (error) {
    const accessResponse = deckAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    console.error('Error in GET /api/decks/[id]/study/sessions:', error);

    if (error instanceof Error && error.message.includes('No deck found')) {
      return NextResponse.json(
        { error: 'Deck not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch deck study history' },
      { status: 500 }
    );
  }
}
