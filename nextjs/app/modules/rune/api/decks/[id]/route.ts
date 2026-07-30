import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getDeckById, updateDeck, deleteDeck, setDeckFavorite } from '../../../lib/deckFunctions';

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
    const deck = await getDeckById(userId!, id);
    return NextResponse.json(deck);

  } catch (error) {
    console.error('Error in GET /api/decks/[id]:', error);

    if (error instanceof Error && error.message.includes('No deck found')) {
      return NextResponse.json(
        { error: 'Deck not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch deck' },
      { status: 500 }
    );
  }
}

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

    const body = await request.json();
    const { name, description, sourceUrl } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Deck name is required' },
        { status: 400 }
      );
    }

    await updateDeck(userId!, id, name.trim(), description?.trim() || null, sourceUrl?.trim() || null);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in PUT /api/decks/[id]:', error);

    if (error instanceof Error && error.message.includes('No deck found')) {
      return NextResponse.json(
        { error: 'Deck not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update deck' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    const body = await request.json();

    // PATCH is a partial update — currently just the favorite toggle.
    if (typeof body.is_favorite !== 'boolean') {
      return NextResponse.json(
        { error: 'is_favorite (boolean) required' },
        { status: 400 }
      );
    }

    await setDeckFavorite(userId!, id, body.is_favorite);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in PATCH /api/decks/[id]:', error);

    if (error instanceof Error && error.message.includes('No deck found')) {
      return NextResponse.json(
        { error: 'Deck not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update deck' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    await deleteDeck(userId!, id);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in DELETE /api/decks/[id]:', error);
    return NextResponse.json(
      { error: 'Failed to delete deck' },
      { status: 500 }
    );
  }
}
