import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { reorderCards } from '../../../../../lib/cardFunctions';
import { getDeckById } from '../../../../../lib/deckFunctions';

// Persists the deck's manual card order after a row is dragged in the table view. The body
// is the deck's full card order — the client moves one card within the order it already has
// and sends the result, so every untouched card keeps its relative position.
export async function PUT(
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

    // Verify deck ownership
    await getDeckById(userId!, id);

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }

    const { ids } = body;
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((value) => typeof value !== 'string' || !value)) {
      return NextResponse.json({ error: 'ids must be a non-empty array of card ids' }, { status: 400 });
    }

    await reorderCards(userId!, id, ids);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in PUT /api/decks/[id]/cards/reorder:', error);

    if (error instanceof Error && error.message.includes('No deck found')) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to reorder cards' }, { status: 500 });
  }
}
