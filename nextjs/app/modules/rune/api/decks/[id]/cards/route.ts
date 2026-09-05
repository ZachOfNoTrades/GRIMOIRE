import { NextResponse } from 'next/server';
import { getAuthorizedUser, getRequestChannel } from '@/lib/permissions';
import { getCardsByDeckId, insertCard, updateCard, updateCardsBulk, deleteCard, CardSheetEdit, CardSheetInsert } from '../../../../lib/cardFunctions';
import { CARD_SOURCE_REF_MAX, CARD_CATEGORY_MAX } from '../../../../types/card';
import { getDeckById } from '../../../../lib/deckFunctions';

// Validates one of the card's OPTIONAL free-text fields straight off the request body.
// Returns null when it's fine, or the 400 response to send back.
//
// Both branches are real 500s this used to answer, not hypotheticals: a non-string value
// (`"category": 123`) reached `.trim()` in the lib as a TypeError, and a value longer than
// the column overflowed it in the driver — each surfacing as an opaque
// "Failed to create card" 500. Absent/undefined is always fine; these fields are optional.
function badOptionalText(value: unknown, field: string, max?: number): NextResponse | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    return NextResponse.json({ error: `${field} must be a string` }, { status: 400 });
  }
  if (max !== undefined && value.trim().length > max) {
    return NextResponse.json({ error: `${field} must be ${max} characters or fewer` }, { status: 400 });
  }
  return null;
}

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
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;

    // Verify deck ownership
    await getDeckById(userId!, id);

    // A body that isn't JSON at all is a client mistake, not a server fault — parse it
    // behind a guard so it answers 400 with the standard { error } envelope instead of
    // throwing into the catch-all and reporting a 500.
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }
    const { front, back, notes, category, is_draft, source_ref, after_card_id } = body;

    // Typed check, not just truthiness: a non-string front (a number, an object) used to
    // sail past `!front` and blow up in the driver as a 500. Whitespace-only is rejected
    // too — it stored as an empty front, leaving a card that renders as a blank row and
    // sorts as an empty string.
    if (typeof front !== 'string' || !front.trim()) {
      return NextResponse.json(
        { error: 'front is required' },
        { status: 400 }
      );
    }

    // `back` is OPTIONAL — omitted, null or blank all create a card with no answer, which
    // is how a question set gets imported ahead of its answers. Only the type is enforced, so
    // a non-string still 400s here instead of reaching the driver as a 500.
    if (back !== undefined && back !== null && typeof back !== 'string') {
      return NextResponse.json(
        { error: 'back must be a string' },
        { status: 400 }
      );
    }

    // OPTIONAL TEXT FIELDS — typed + length checked before they reach the driver.
    const invalid = badOptionalText(notes, 'notes')
      ?? badOptionalText(category, 'category', CARD_CATEGORY_MAX)
      ?? badOptionalText(source_ref, 'source_ref', CARD_SOURCE_REF_MAX);
    if (invalid) return invalid;

    // OPTIONAL POSITION — the id of the card this one goes directly below, from the table
    // view's per-row insert. Omitted (the historical shape) still appends to the deck.
    if (after_card_id !== undefined && after_card_id !== null && typeof after_card_id !== 'string') {
      return NextResponse.json({ error: 'after_card_id must be a string' }, { status: 400 });
    }

    const card = await insertCard(userId!, id, front, back ?? '', notes || null, category || null, !!is_draft, source_ref || null, getRequestChannel(request), (after_card_id as string) || null);
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

    // A body that isn't JSON at all is a client mistake, not a server fault — parse it
    // behind a guard so it answers 400 with the standard { error } envelope instead of
    // throwing into the catch-all and reporting a 500.
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }
    const { cardId, front, back, notes, category, is_draft, source_ref } = body;

    // Same typed guard as POST — a non-string or whitespace-only front is a 400, not a
    // 500 from the driver (or a card edited into a blank row).
    if (typeof cardId !== 'string' || !cardId
      || typeof front !== 'string' || !front.trim()) {
      return NextResponse.json(
        { error: 'cardId and front are required' },
        { status: 400 }
      );
    }

    // `back` is optional here too: send null or '' to clear a card's answer, or omit the
    // key entirely to leave it untouched (see the updateCard call below).
    if (back !== undefined && back !== null && typeof back !== 'string') {
      return NextResponse.json(
        { error: 'back must be a string' },
        { status: 400 }
      );
    }

    // OPTIONAL TEXT FIELDS — same typed + length gate as POST.
    const invalid = badOptionalText(notes, 'notes')
      ?? badOptionalText(category, 'category', CARD_CATEGORY_MAX)
      ?? badOptionalText(source_ref, 'source_ref', CARD_SOURCE_REF_MAX);
    if (invalid) return invalid;

    // back, category, is_draft and source_ref are omitted (undefined) when the caller
    // didn't send them — updateCard treats that as "leave unchanged" rather than clearing
    // the value. An explicit null/'' back DOES clear it, leaving the card with no answer.
    await updateCard(
      userId!,
      cardId,
      front,
      'back' in body ? (back ?? '') : undefined,
      notes || null,
      'category' in body ? (category || null) : undefined,
      'is_draft' in body ? !!is_draft : undefined,
      'source_ref' in body ? (source_ref || null) : undefined,
      getRequestChannel(request)
    );
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in PUT /api/decks/[id]/cards:', error);

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
      { error: 'Failed to update card' },
      { status: 500 }
    );
  }
}

// Saves the deck table's sheet edit — every row the user changed, in one request and one
// transaction. It exists instead of a loop of PUTs for two reasons: a half-applied batch
// (some rows saved, the rest lost to a mid-flight failure) would leave the sheet the user
// is looking at disagreeing with the deck, and PUT always writes `notes`, so replaying it
// per row from a view that has no notes cell would silently clear them. Only the cells the
// sheet shows are accepted here; everything else on the card is left alone.
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

    // Verify deck ownership
    await getDeckById(userId!, id);

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
    }

    // `cards` are edits to existing rows; `create` are rows added during the same pass over
    // the table, each carrying the card it was inserted below. Either may be empty, but a
    // save that would write nothing is a client mistake.
    const { cards, create } = body;
    if (cards !== undefined && !Array.isArray(cards)) {
      return NextResponse.json({ error: 'cards must be an array' }, { status: 400 });
    }
    if (create !== undefined && !Array.isArray(create)) {
      return NextResponse.json({ error: 'create must be an array' }, { status: 400 });
    }
    const editRows: unknown[] = Array.isArray(cards) ? cards : [];
    const createRows: unknown[] = Array.isArray(create) ? create : [];
    if (editRows.length === 0 && createRows.length === 0) {
      return NextResponse.json({ error: 'cards must be a non-empty array' }, { status: 400 });
    }

    // Every row is validated BEFORE any of them is written — the whole point of the
    // endpoint is that a sheet save either lands completely or not at all, so one bad
    // row has to 400 the batch rather than fail it halfway through the transaction.
    const edits: CardSheetEdit[] = [];
    for (const card of editRows) {
      if (!card || typeof card !== 'object') {
        return NextResponse.json({ error: 'each card must be an object' }, { status: 400 });
      }
      const { cardId, front, back, notes, category, is_draft } = card as Record<string, unknown>;

      // Same typed guard as PUT — a non-string or whitespace-only front is a 400, not a
      // 500 from the driver (or a card edited into a blank row).
      if (typeof cardId !== 'string' || !cardId
        || typeof front !== 'string' || !front.trim()) {
        return NextResponse.json({ error: 'cardId and front are required for every card' }, { status: 400 });
      }
      if (back !== undefined && back !== null && typeof back !== 'string') {
        return NextResponse.json({ error: 'back must be a string' }, { status: 400 });
      }
      const invalid = badOptionalText(notes, 'notes')
        ?? badOptionalText(category, 'category', CARD_CATEGORY_MAX);
      if (invalid) return invalid;
      if (is_draft !== undefined && typeof is_draft !== 'boolean') {
        return NextResponse.json({ error: 'is_draft must be a boolean' }, { status: 400 });
      }

      edits.push({
        id: cardId,
        front,
        // Tri-state, mirroring PUT: a key the sheet didn't send leaves that column alone.
        ...('back' in (card as object) ? { back: (back as string | null) ?? '' } : {}),
        ...('notes' in (card as object) ? { notes: (notes as string) || null } : {}),
        ...('category' in (card as object) ? { category: (category as string) || null } : {}),
        ...('is_draft' in (card as object) ? { isDraft: !!is_draft } : {}),
      });
    }

    // NEW ROWS — validated to the same standard as POST, and before anything is written, so
    // one bad new row 400s the save instead of committing the edits without it.
    const inserts: CardSheetInsert[] = [];
    for (const row of createRows) {
      if (!row || typeof row !== 'object') {
        return NextResponse.json({ error: 'each new card must be an object' }, { status: 400 });
      }
      const { front, back, notes, category, is_draft, after_card_id } = row as Record<string, unknown>;
      if (typeof front !== 'string' || !front.trim()) {
        return NextResponse.json({ error: 'front is required for every new card' }, { status: 400 });
      }
      if (back !== undefined && back !== null && typeof back !== 'string') {
        return NextResponse.json({ error: 'back must be a string' }, { status: 400 });
      }
      const invalidNew = badOptionalText(notes, 'notes')
        ?? badOptionalText(category, 'category', CARD_CATEGORY_MAX);
      if (invalidNew) return invalidNew;
      if (is_draft !== undefined && typeof is_draft !== 'boolean') {
        return NextResponse.json({ error: 'is_draft must be a boolean' }, { status: 400 });
      }
      if (after_card_id !== undefined && after_card_id !== null && typeof after_card_id !== 'string') {
        return NextResponse.json({ error: 'after_card_id must be a string' }, { status: 400 });
      }
      inserts.push({
        front,
        back: (back as string | null) ?? '',
        notes: (notes as string) || null,
        category: (category as string) || null,
        isDraft: !!is_draft,
        afterCardId: (after_card_id as string) || null,
      });
    }

    const { updated, created } = await updateCardsBulk(userId!, id, edits, getRequestChannel(request), inserts);
    return NextResponse.json({ success: true, updated, created });

  } catch (error) {
    console.error('Error in PATCH /api/decks/[id]/cards:', error);

    if (error instanceof Error && error.message.includes('No deck found')) {
      return NextResponse.json(
        { error: 'Deck not found' },
        { status: 404 }
      );
    }

    // A card id that isn't in this deck means the client's list is stale — nothing was
    // written (the transaction rolled back), so the caller should refetch and retry.
    if (error instanceof Error && error.message.includes('No card found')) {
      return NextResponse.json(
        { error: 'A card in this batch no longer exists — reload the deck and try again' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to update cards' },
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

    const body = await request.json();
    const { cardId } = body;

    if (!cardId) {
      return NextResponse.json(
        { error: 'cardId is required' },
        { status: 400 }
      );
    }

    await deleteCard(userId!, cardId);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in DELETE /api/decks/[id]/cards:', error);

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
      { error: 'Failed to delete card' },
      { status: 500 }
    );
  }
}

