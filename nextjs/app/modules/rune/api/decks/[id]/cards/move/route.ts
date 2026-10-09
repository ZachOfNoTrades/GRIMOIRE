import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { moveCards } from '../../../../../lib/cardFunctions';
import { requireDeckAccess, deckAccessErrorResponse } from '../../../../../lib/shareFunctions';

// One request moves a whole selection, so a bulk move is a single transaction rather than
// one call per card. Bounded so a hand-rolled body can't hand the server an unbounded list.
const MAX_CARDS_PER_MOVE = 2000;

// Moves cards out of this deck into another. The caller needs edit rights on BOTH decks:
// a move deletes the card from one and adds it to the other, and neither half is something
// a viewer may do.
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const viewer = { id: session.user.id!, email: session.user.email };

    const { id } = await context.params;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }
    const { cardIds, targetDeckId } = body ?? {};

    if (typeof targetDeckId !== 'string' || !targetDeckId) {
      return NextResponse.json({ error: 'targetDeckId is required' }, { status: 400 });
    }
    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      return NextResponse.json({ error: 'cardIds must be a non-empty array' }, { status: 400 });
    }
    if (cardIds.length > MAX_CARDS_PER_MOVE) {
      return NextResponse.json({ error: `Move at most ${MAX_CARDS_PER_MOVE} cards at a time` }, { status: 400 });
    }
    if (cardIds.some((cardId) => typeof cardId !== 'string')) {
      return NextResponse.json({ error: 'cardIds must be strings' }, { status: 400 });
    }
    if (targetDeckId.toLowerCase() === id.toLowerCase()) {
      return NextResponse.json({ error: 'Cards are already in this deck' }, { status: 400 });
    }

    await requireDeckAccess(viewer, id, 'edit');
    const target = await requireDeckAccess(viewer, targetDeckId, 'edit');

    const moved = await moveCards(id, targetDeckId, target.ownerId, cardIds);
    return NextResponse.json({ moved });

  } catch (error) {
    const accessResponse = deckAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    if (error instanceof Error && error.message.includes('No card found')) {
      return NextResponse.json({ error: 'One or more cards are no longer in this deck' }, { status: 404 });
    }

    console.error('Error in POST /api/decks/[id]/cards/move:', error);
    return NextResponse.json({ error: 'Failed to move cards' }, { status: 500 });
  }
}
