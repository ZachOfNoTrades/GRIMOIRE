import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { submitCardReview, completeStudySession } from '../../../../../lib/studyFunctions';
import { requireDeckAccess, deckAccessErrorResponse, assertCardInDeck } from '../../../../../lib/shareFunctions';

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

    const access = await requireDeckAccess({ id: userId!, email: session.user.email }, id, 'view');

    const body = await request.json();
    const { cardId, studySessionId, rating, responseTimeMs } = body;

    if (!cardId || !studySessionId) {
      return NextResponse.json(
        { error: 'cardId and studySessionId are required' },
        { status: 400 }
      );
    }

    if (!rating || rating < 1 || rating > 4) {
      return NextResponse.json(
        { error: 'Rating must be 1-4' },
        { status: 400 }
      );
    }

    // Only a card in this deck — access was checked for the deck, not the card.
    await assertCardInDeck(id, cardId);
    await submitCardReview(userId!, cardId, studySessionId, rating, responseTimeMs || null);
    return NextResponse.json({ success: true });

  } catch (error) {
    const accessResponse = deckAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    if (error instanceof Error && error.message.includes('No card found')) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    console.error('Error in POST /api/decks/[id]/study/review:', error);

    if (error instanceof Error && error.message.includes('No deck found')) {
      return NextResponse.json(
        { error: 'Deck not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to submit review' },
      { status: 500 }
    );
  }
}

export async function PUT(
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

    const access = await requireDeckAccess({ id: userId!, email: session.user.email }, id, 'view');

    const body = await request.json();
    const { studySessionId, durationSeconds } = body;

    if (!studySessionId) {
      return NextResponse.json(
        { error: 'studySessionId is required' },
        { status: 400 }
      );
    }

    await completeStudySession(userId!, studySessionId, durationSeconds || 0);
    return NextResponse.json({ success: true });

  } catch (error) {
    const accessResponse = deckAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    if (error instanceof Error && error.message.includes('No card found')) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    console.error('Error in PUT /api/decks/[id]/study/review:', error);

    if (error instanceof Error && error.message.includes('No deck found')) {
      return NextResponse.json(
        { error: 'Deck not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to complete session' },
      { status: 500 }
    );
  }
}
