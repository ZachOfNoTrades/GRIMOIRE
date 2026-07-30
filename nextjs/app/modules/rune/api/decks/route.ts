import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getAllDecks, createDeck } from '../../lib/deckFunctions';

export async function GET(request: Request) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const result = await getAllDecks(userId!);
    return NextResponse.json(result);

  } catch (error) {
    console.error('Error in GET /api/decks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch decks' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json();
    const { name, description, sourceUrl } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Deck name is required' },
        { status: 400 }
      );
    }

    const deck = await createDeck(userId!, name.trim(), description?.trim() || null, sourceUrl?.trim() || null);
    return NextResponse.json(deck, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/decks:', error);
    return NextResponse.json(
      { error: 'Failed to create deck' },
      { status: 500 }
    );
  }
}
