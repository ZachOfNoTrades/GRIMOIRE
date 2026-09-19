import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import {
  requireDeckAccess,
  deckAccessErrorResponse,
  listDeckShares,
  shareDeck,
  normalizeEmail,
  isValidShareEmail,
  isDeckShareRole,
} from '../../../../lib/shareFunctions';
import { SHARE_EMAIL_MAX_LENGTH } from '../../../../types/share';

// GET: the owner's "shared with" list — the addresses they entered and each one's role.
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    await requireDeckAccess({ id: session.user.id!, email: session.user.email }, id, 'owner');

    const shares = await listDeckShares(id);
    return NextResponse.json({ shares });

  } catch (error) {
    const accessResponse = deckAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    console.error('Error in GET /api/decks/[id]/shares:', error);
    return NextResponse.json({ error: 'Failed to fetch shares' }, { status: 500 });
  }
}

// POST: share the deck with an email address. Fire-and-forget by design: the response is the
// same `{ success: true }` whether or not the address belongs to an account, is enabled, or has
// already been shared with — the sharer learns nothing about the recipient. Sharing again with
// the same address just updates its role. The recipient sees the deck in their own list once
// they're signed in to GRIMOIRE with that address.
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    await requireDeckAccess({ id: session.user.id!, email: session.user.email }, id, 'owner');

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }
    const { email, role } = body;

    // Only the shape of the address is checked — never whether it exists.
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    const normalized = normalizeEmail(email);
    if (normalized.length > SHARE_EMAIL_MAX_LENGTH || !isValidShareEmail(normalized)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }
    if (!isDeckShareRole(role)) {
      return NextResponse.json({ error: "role must be 'view' or 'edit'" }, { status: 400 });
    }

    // The sharer's own address is the one recipient whose existence isn't a secret from them.
    if (session.user.email && normalized === normalizeEmail(session.user.email)) {
      return NextResponse.json({ error: "That's your own email — this deck is already yours" }, { status: 400 });
    }

    await shareDeck(id, normalized, role);
    return NextResponse.json({ success: true });

  } catch (error) {
    const accessResponse = deckAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    console.error('Error in POST /api/decks/[id]/shares:', error);
    return NextResponse.json({ error: 'Failed to share deck' }, { status: 500 });
  }
}
