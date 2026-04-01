import { NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { getCardsByDeckId, insertCard } from '../../../../lib/cardFunctions';
import { getDeckById } from '../../../../lib/deckFunctions';

export async function GET(
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
    const cards = await getCardsByDeckId(userId!, id);
    return NextResponse.json(cards);

  } catch (error) {
    console.error('Error in GET /api/decks/[id]/cards:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cards' },
      { status: 500 }
    );
  }
}

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

    const body = await request.json();
    const { front, back, notes } = body;

    if (!front || !back) {
      return NextResponse.json(
        { error: 'front and back are required' },
        { status: 400 }
      );
    }

    const card = await insertCard(userId!, id, front, back, notes || null);
    return NextResponse.json(card);

  } catch (error) {
    console.error('Error in POST /api/decks/[id]/cards:', error);

    if (error instanceof Error && error.message.includes('No deck found')) {
      return NextResponse.json(
        { error: 'Deck not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create card' },
      { status: 500 }
    );
  }
}

