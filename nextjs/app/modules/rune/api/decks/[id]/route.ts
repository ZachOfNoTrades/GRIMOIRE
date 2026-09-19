import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getDeckById, updateDeck, deleteDeck, setDeckFavorite, setDeckDisabled } from '../../../lib/deckFunctions';
import {
  getDeckAccess,
  requireDeckAccess,
  deckAccessErrorResponse,
  countDeckShares,
  lookupOwnerNames,
  setShareFlags,
} from '../../../lib/shareFunctions';
import { DECK_NAME_MAX_LENGTH, DECK_SOURCE_URL_MAX_LENGTH } from '../../../types/deck';

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
    const access = await getDeckAccess({ id: userId!, email: session.user.email }, id);
    const deck = await getDeckById(access.ownerId, id, userId!);

    if (access.role === 'owner') {
      return NextResponse.json({ ...deck, access_role: 'owner', share_count: await countDeckShares(id) });
    }

    // A sharee sees their OWN star and pause state, not the owner's, and whose deck it is.
    const ownerNames = await lookupOwnerNames([access.ownerId]);
    return NextResponse.json({
      ...deck,
      is_favorite: !!access.shareFavorite,
      is_disabled: !!access.shareDisabled,
      access_role: access.role,
      owner_name: ownerNames.get(access.ownerId.toLowerCase()) ?? null,
    });

  } catch (error) {
    const accessResponse = deckAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    console.error('Error in GET /api/decks/[id]:', error);
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

    // Editing the deck's name/description is an edit-role action; it is written as the owner.
    const access = await requireDeckAccess({ id: userId!, email: session.user.email }, id, 'edit');

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

    await updateDeck(access.ownerId, id, name.trim(), description?.trim() || null, sourceUrl?.trim() || null);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    // Same unique index as the create path — renaming onto an existing name is a 409. The
    // index is per OWNER, so an editor can collide with another of the owner's decks.
    if (error?.message?.toLowerCase?.().includes('ux_decks_user_name') ||
        error?.number === 2627 || error?.number === 2601) {
      return NextResponse.json(
        { error: 'A deck with that name already exists' },
        { status: 409 }
      );
    }

    const accessResponse = deckAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    console.error('Error in PUT /api/decks/[id]:', error);
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

    // A truncated or non-JSON body is a bad request, not a server fault — parse it
    // explicitly so it can't fall through to the catch-all 500 below.
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // PATCH is a partial update — the favorite star and the disable (pause) toggle. Either
    // may be sent alone; sending neither is a bad request rather than a silent no-op.
    const hasFavorite = typeof body.is_favorite === 'boolean';
    const hasDisabled = typeof body.is_disabled === 'boolean';

    if (!hasFavorite && !hasDisabled) {
      return NextResponse.json(
        { error: 'is_favorite (boolean) or is_disabled (boolean) required' },
        { status: 400 }
      );
    }

    const viewer = { id: userId!, email: session.user.email };
    const access = await getDeckAccess(viewer, id);

    // Both flags are personal. A sharee's go on their share row — any role may set them —
    // so starring or pausing a shared deck never changes it for the owner.
    if (access.role !== 'owner') {
      await setShareFlags(viewer, id, {
        isFavorite: hasFavorite ? (body.is_favorite as boolean) : undefined,
        isDisabled: hasDisabled ? (body.is_disabled as boolean) : undefined,
      });
      return NextResponse.json({ success: true });
    }

    if (hasFavorite) {
      await setDeckFavorite(userId!, id, body.is_favorite as boolean);
    }

    if (hasDisabled) {
      await setDeckDisabled(userId!, id, body.is_disabled as boolean);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    const accessResponse = deckAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    console.error('Error in PATCH /api/decks/[id]:', error);
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

    // Only the owner deletes a deck. A sharee removes it from their own list instead
    // (DELETE /shares/me). The deck's shares go with it (FK ON DELETE CASCADE).
    await requireDeckAccess({ id: userId!, email: session.user.email }, id, 'owner');

    await deleteDeck(userId!, id);
    return NextResponse.json({ success: true });

  } catch (error) {
    const accessResponse = deckAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    console.error('Error in DELETE /api/decks/[id]:', error);
    return NextResponse.json(
      { error: 'Failed to delete deck' },
      { status: 500 }
    );
  }
}
