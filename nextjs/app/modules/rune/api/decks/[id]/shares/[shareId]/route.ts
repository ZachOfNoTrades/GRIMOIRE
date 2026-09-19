import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import {
  getDeckAccess,
  requireDeckAccess,
  deckAccessErrorResponse,
  updateDeckShareRole,
  deleteDeckShare,
  leaveDeckShare,
  isDeckShareRole,
} from '../../../../../lib/shareFunctions';

// The literal share id a sharee uses to remove a deck shared with them from their own list.
const SELF = 'me';

function shareNotFound(error: unknown): NextResponse | null {
  if (error instanceof Error && error.message.includes('No share found')) {
    return NextResponse.json({ error: 'Share not found' }, { status: 404 });
  }
  return null;
}

// PATCH: the owner changes a share's role.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; shareId: string }> }
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, shareId } = await context.params;
    await requireDeckAccess({ id: session.user.id!, email: session.user.email }, id, 'owner');

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }
    if (!isDeckShareRole(body.role)) {
      return NextResponse.json({ error: "role must be 'view' or 'edit'" }, { status: 400 });
    }

    await updateDeckShareRole(id, shareId, body.role);
    return NextResponse.json({ success: true });

  } catch (error) {
    const response = deckAccessErrorResponse(error) ?? shareNotFound(error);
    if (response) return response;

    console.error('Error in PATCH /api/decks/[id]/shares/[shareId]:', error);
    return NextResponse.json({ error: 'Failed to update share' }, { status: 500 });
  }
}

// DELETE: the owner revokes a share — or, with shareId `me`, a sharee removes the deck from
// their own list. Either way the sharee's study progress is kept, so a later re-share resumes it.
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; shareId: string }> }
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, shareId } = await context.params;
    const viewer = { id: session.user.id!, email: session.user.email };

    if (shareId === SELF) {
      const access = await getDeckAccess(viewer, id);
      if (access.role === 'owner') {
        return NextResponse.json({ error: 'This is your own deck — delete it instead' }, { status: 400 });
      }
      await leaveDeckShare(viewer, id);
      return NextResponse.json({ success: true });
    }

    await requireDeckAccess(viewer, id, 'owner');
    await deleteDeckShare(id, shareId);
    return NextResponse.json({ success: true });

  } catch (error) {
    const response = deckAccessErrorResponse(error) ?? shareNotFound(error);
    if (response) return response;

    console.error('Error in DELETE /api/decks/[id]/shares/[shareId]:', error);
    return NextResponse.json({ error: 'Failed to remove share' }, { status: 500 });
  }
}
