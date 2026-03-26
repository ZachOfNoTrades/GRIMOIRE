import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { checkGenerationLimit, logGeneration } from '@/lib/generationLimit';
import { createJob, completeJob, failJob } from '@/lib/generationJobStore';
import { generateDeckFromNotion, generateDeckFromDescription } from '../../../lib/generationFunctions';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // Rate limit check
    const { allowed, count, limit } = await checkGenerationLimit(userId!, session.user.generationLimit);
    if (!allowed) {
      return NextResponse.json(
        { error: `Generation limit reached (${count}/${limit} in 24h)` },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { deckName, deckDescription, notionUrl, customPrompt } = body;

    if (!deckName || typeof deckName !== 'string' || deckName.trim().length === 0) {
      return NextResponse.json(
        { error: 'Deck name is required' },
        { status: 400 }
      );
    }

    // Notion URL is optional — if not provided, generate from description
    const hasNotionUrl = notionUrl && typeof notionUrl === 'string' && notionUrl.trim().length > 0;

    const job = createJob(userId!, "/modules/rune/api/decks/generate");

    // Fire-and-forget
    (async () => {
      try {
        const result = hasNotionUrl
          ? await generateDeckFromNotion(
              userId!,
              deckName.trim(),
              deckDescription?.trim() || null,
              notionUrl.trim(),
              customPrompt?.trim() || null,
            )
          : await generateDeckFromDescription(
              userId!,
              deckName.trim(),
              deckDescription?.trim() || null,
              customPrompt?.trim() || null,
            );

        await logGeneration(userId!, "/modules/rune/api/decks/generate");
        completeJob(job.id, result);
        console.log(`[Generation] Job ${job.id} completed`);
      } catch (error: any) {
        console.error(`[Generation] Job ${job.id} failed:`, error);
        failJob(job.id, error?.message || "Generation failed");
      }
    })();

    return NextResponse.json({ jobId: job.id }, { status: 202 });

  } catch (error: any) {
    console.error('Error in POST /api/decks/generate:', error);
    return NextResponse.json(
      { error: 'Failed to generate deck' },
      { status: 500 }
    );
  }
}
