import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser, getRequestChannel } from '@/lib/permissions';
import { requireDeckAccess, deckAccessErrorResponse, assertCardInDeck } from '../../../../../lib/shareFunctions';
import { getCardById } from '../../../../../lib/cardFunctions';
import { refineCard } from '../../../../../lib/refineFunctions';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;

    const access = await requireDeckAccess({ id: userId!, email: session.user.email }, id, 'edit');

    const body = await request.json();
    const { cardId, feedback } = body;

    if (!cardId || typeof cardId !== 'string') {
      return NextResponse.json(
        { error: 'cardId is required' },
        { status: 400 }
      );
    }

    if (!feedback || typeof feedback !== 'string' || feedback.trim().length === 0) {
      return NextResponse.json(
        { error: 'Feedback is required' },
        { status: 400 }
      );
    }

    // Verify the card is in THIS deck (and so reachable through the caller's access).
    await assertCardInDeck(id, cardId);
    await getCardById(access.ownerId, cardId);

    const result = await refineCard(access.ownerId, cardId, feedback.trim(), getRequestChannel(request));

    return NextResponse.json(result);

  } catch (error: any) {
    const accessResponse = deckAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    console.error('Error in POST /api/decks/[id]/cards/refine:', error);

    if (error instanceof Error && error.message.includes('No deck found')) {
      return NextResponse.json(
        { error: 'Deck not found' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message.includes('No card found')) {
      return NextResponse.json(
        { error: 'Card not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to refine card' },
      { status: 500 }
    );
  }
}
