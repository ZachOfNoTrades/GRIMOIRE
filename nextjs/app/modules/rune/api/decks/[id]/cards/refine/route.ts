import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getDeckById } from '../../../../../lib/deckFunctions';
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

    // Verify deck ownership
    await getDeckById(userId!, id);

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

    // Verify card ownership
    await getCardById(userId!, cardId);

    const result = await refineCard(userId!, cardId, feedback.trim());

    return NextResponse.json(result);

  } catch (error: any) {
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
