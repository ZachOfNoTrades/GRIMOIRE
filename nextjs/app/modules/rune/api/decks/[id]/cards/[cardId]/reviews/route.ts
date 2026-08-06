import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getCardReviewHistory } from '../../../../../../lib/cardFunctions';
import { getDeckById } from '../../../../../../lib/deckFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; cardId: string }> }
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id, cardId } = await context.params;

    // Verify deck ownership
    await getDeckById(userId!, id);

    const reviews = await getCardReviewHistory(userId!, cardId);
    return NextResponse.json(reviews);

  } catch (error) {
    console.error('Error in GET /api/decks/[id]/cards/[cardId]/reviews:', error);

    if (error instanceof Error && error.message.includes('No deck found')) {
      return NextResponse.json(
        { error: 'Deck not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch card review history' },
      { status: 500 }
    );
  }
}
