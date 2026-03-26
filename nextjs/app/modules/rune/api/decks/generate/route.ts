import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession, isAdmin } from '@/lib/permissions';
import { shouldAdminBypassLimit, checkGenerationLimit, logGeneration } from '@/lib/generationLimit';
import { generateDeckFromNotion } from '../../../lib/generationFunctions';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // Rate limit check (admins bypass if enabled)
    const skipLimit = shouldAdminBypassLimit() && await isAdmin();
    if (!skipLimit) {
      const { allowed, count, limit } = await checkGenerationLimit(userId!);
      if (!allowed) {
        return NextResponse.json(
          { error: `Generation limit reached (${count}/${limit} in 24h)` },
          { status: 429 }
        );
      }
    }

    const body = await request.json();
    const { deckName, deckDescription, notionUrl, customPrompt } = body;

    if (!deckName || typeof deckName !== 'string' || deckName.trim().length === 0) {
      return NextResponse.json(
        { error: 'Deck name is required' },
        { status: 400 }
      );
    }

    if (!notionUrl || typeof notionUrl !== 'string' || notionUrl.trim().length === 0) {
      return NextResponse.json(
        { error: 'Notion URL is required' },
        { status: 400 }
      );
    }

    const result = await generateDeckFromNotion(
      userId!,
      deckName.trim(),
      deckDescription?.trim() || null,
      notionUrl.trim(),
      customPrompt?.trim() || null,
    );

    await logGeneration(userId!, "/modules/rune/api/decks/generate");

    return NextResponse.json({
      success: true,
      deckId: result.deckId,
      cardsGenerated: result.cardsGenerated,
      notionPageTitle: result.notionPageTitle,
    }, { status: 201 });

  } catch (error: any) {
    // Unique constraint violation (duplicate deck name)
    if (error?.number === 2627 || error?.number === 2601) {
      return NextResponse.json(
        { error: 'A deck with this name already exists' },
        { status: 409 }
      );
    }

    // Notion fetch errors
    if (error?.message?.includes('Failed to fetch Notion') || error?.message?.includes('Could not parse Notion')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // Empty Notion page
    if (error?.message?.includes('no content')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // LLM validation errors
    if (error?.message?.includes('validation failed')) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    console.error('Error in POST /api/decks/generate:', error);
    return NextResponse.json(
      { error: 'Failed to generate deck' },
      { status: 500 }
    );
  }
}
