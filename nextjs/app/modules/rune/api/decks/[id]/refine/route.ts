import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser, getRequestChannel } from '@/lib/permissions';
import { checkGenerationLimit, logGeneration } from '@/lib/generationLimit';
import { createJob, completeJob, failJob } from '@/lib/generationJobStore';
import { requireDeckAccess, deckAccessErrorResponse } from '../../../../lib/shareFunctions';
import { applyRefinedCards } from '../../../../lib/cardFunctions';
import { proposeDeckRefinement } from '../../../../lib/refineFunctions';
import { ProposedChange, RefinedCard } from '../../../../types/generation';

// POST: Generate proposed changes (async job). Returns { jobId }.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;

    const access = await requireDeckAccess({ id: userId!, email: session.user.email }, id, 'edit');

    // Rate limit check
    const { allowed, count, limit } = await checkGenerationLimit(userId!, session.user.generationLimit);
    if (!allowed) {
      return NextResponse.json(
        { error: `Generation limit reached (${count}/${limit} in 24h)` },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { feedback } = body;

    if (!feedback || typeof feedback !== 'string' || feedback.trim().length === 0) {
      return NextResponse.json(
        { error: 'Feedback is required' },
        { status: 400 }
      );
    }

    const job = createJob(userId!, `/modules/rune/api/decks/${id}/refine`);

    // Fire-and-forget — returns proposed changes (not applied)
    (async () => {
      try {
        const proposal = await proposeDeckRefinement(access.ownerId, id, feedback.trim());
        await logGeneration(userId!, `/modules/rune/api/decks/${id}/refine`);
        completeJob(job.id, proposal);
        console.log(`[Refine] Job ${job.id} completed with ${proposal.changes.length} proposed changes`);
      } catch (error: any) {
        console.error(`[Refine] Job ${job.id} failed:`, error);
        failJob(job.id, error?.message || 'Refinement failed');
      }
    })();

    return NextResponse.json({ jobId: job.id }, { status: 202 });

  } catch (error: any) {
    const accessResponse = deckAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    console.error('Error in POST /api/decks/[id]/refine:', error);

    if (error instanceof Error && error.message.includes('No deck found')) {
      return NextResponse.json(
        { error: 'Deck not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to start deck refinement' },
      { status: 500 }
    );
  }
}

// PUT: Apply user-approved changes. Accepts { approvedChanges: ProposedChange[] }.
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await context.params;

    const access = await requireDeckAccess({ id: userId!, email: session.user.email }, id, 'edit');

    const body = await request.json();
    const { approvedChanges } = body as { approvedChanges: ProposedChange[] };

    if (!approvedChanges || !Array.isArray(approvedChanges) || approvedChanges.length === 0) {
      return NextResponse.json(
        { error: 'approvedChanges array is required' },
        { status: 400 }
      );
    }

    // Convert approved changes into the RefinedCard format expected by applyRefinedCards.
    // Start with all existing cards that are NOT being deleted, then layer in modifications and additions.
    const { getCardsByDeckId } = await import('../../../../lib/cardFunctions');
    const existingCards = await getCardsByDeckId(access.ownerId, id, userId!);
    const existingMap = new Map(existingCards.map((c) => [c.id, c]));

    // Track which existing cards are affected by approved changes
    const deletedIds = new Set(
      approvedChanges.filter((c) => c.type === 'deleted' && c.cardId).map((c) => c.cardId!)
    );
    const modifiedMap = new Map(
      approvedChanges.filter((c) => c.type === 'modified' && c.cardId).map((c) => [c.cardId!, c])
    );

    // Build the final card set
    const refinedCards: RefinedCard[] = [];

    // Keep unaffected + apply modifications
    for (const [cardId, original] of existingMap) {
      if (deletedIds.has(cardId)) continue; // Skip deleted

      if (modifiedMap.has(cardId)) {
        const mod = modifiedMap.get(cardId)!;
        refinedCards.push({
          id: cardId,
          front: mod.proposedFront!,
          back: mod.proposedBack!,
          notes: mod.proposedNotes,
        });
      } else {
        refinedCards.push({
          id: cardId,
          front: original.front,
          back: original.back,
          notes: original.notes,
        });
      }
    }

    // Add new cards
    for (const change of approvedChanges) {
      if (change.type === 'added') {
        refinedCards.push({
          id: null,
          front: change.proposedFront!,
          back: change.proposedBack!,
          notes: change.proposedNotes,
        });
      }
    }

    const result = await applyRefinedCards(access.ownerId, id, refinedCards, getRequestChannel(request));
    return NextResponse.json(result);

  } catch (error: any) {
    const accessResponse = deckAccessErrorResponse(error);
    if (accessResponse) return accessResponse;

    console.error('Error in PUT /api/decks/[id]/refine:', error);

    if (error instanceof Error && error.message.includes('No deck found')) {
      return NextResponse.json(
        { error: 'Deck not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to apply refinement' },
      { status: 500 }
    );
  }
}
