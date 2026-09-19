import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getAllDecks, createDeck } from '../../lib/deckFunctions';
import { getSharedDecks } from '../../lib/shareFunctions';
import { DECK_NAME_MAX_LENGTH, DECK_SOURCE_URL_MAX_LENGTH } from '../../types/deck';

export async function GET(request: Request) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // `decks` stays the user's OWN decks — the home totals, the collection picker and the
    // MCP tools all read it that way. Decks shared with them come back beside it in `shared`.
    const [result, shared] = await Promise.all([
      getAllDecks(userId!),
      getSharedDecks({ id: userId!, email: session.user.email }),
    ]);
    return NextResponse.json({ ...result, shared });

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

    if (name.trim().length > DECK_NAME_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Deck name must be ${DECK_NAME_MAX_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }

    if (typeof sourceUrl === 'string' && sourceUrl.trim().length > DECK_SOURCE_URL_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Source URL must be ${DECK_SOURCE_URL_MAX_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }

    const deck = await createDeck(userId!, name.trim(), description?.trim() || null, sourceUrl?.trim() || null);
    return NextResponse.json(deck, { status: 201 });

  } catch (error: any) {
    // Unique index UX_decks_user_name on (user_id, name) — a name the user already
    // has is a 409 they can act on, not the generic 500 it used to surface as.
    if (error?.message?.toLowerCase?.().includes('ux_decks_user_name') ||
        error?.number === 2627 || error?.number === 2601) {
      return NextResponse.json(
        { error: 'A deck with that name already exists' },
        { status: 409 }
      );
    }
    console.error('Error in POST /api/decks:', error);
    return NextResponse.json(
      { error: 'Failed to create deck' },
      { status: 500 }
    );
  }
}
