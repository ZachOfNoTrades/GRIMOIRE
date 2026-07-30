import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { checkGenerationLimit, logGeneration } from '@/lib/generationLimit';
import { createJob, completeJob, failJob } from '@/lib/generationJobStore';
import { generateArchetypeProgram } from '../../../lib/llmArchetypeProgramFunctions';

// Archetype-based program generation: the LLM designs the program structure + assigns a day archetype
// to each training day; the deterministic engine fills exercises later, per session. Fire-and-forget job.
export async function POST(request: Request) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // Rate limit check
    const { allowed, count, limit } = await checkGenerationLimit(userId!, session.user.generationLimit);
    if (!allowed) {
      return NextResponse.json({ error: `Generation limit reached (${count}/${limit} in 24h)` }, { status: 429 });
    }

    const body = await request.json();
    const programPrompt = typeof body?.programPrompt === 'string' ? body.programPrompt : '';
    const blockPrompt = typeof body?.blockPrompt === 'string' ? body.blockPrompt : '';
    const weekPrompt = typeof body?.weekPrompt === 'string' ? body.weekPrompt : '';
    const daysPerWeek = Number(body?.daysPerWeek);

    // Validate inputs — at least one prompt and a sane day count
    if (!programPrompt.trim() && !blockPrompt.trim() && !weekPrompt.trim()) {
      return NextResponse.json({ error: 'At least one of programPrompt, blockPrompt, or weekPrompt is required' }, { status: 400 });
    }
    if (!Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7) {
      return NextResponse.json({ error: 'daysPerWeek must be an integer between 1 and 7' }, { status: 400 });
    }

    const job = createJob(userId!, '/modules/golem/api/programs/generate-engine');

    // Fire-and-forget
    (async () => {
      try {
        const programId = await generateArchetypeProgram(userId!, { programPrompt, blockPrompt, weekPrompt }, daysPerWeek);
        await logGeneration(userId!, '/modules/golem/api/programs/generate-engine');
        completeJob(job.id, { id: programId });
        console.log(`[Generation] Job ${job.id} completed`);
      } catch (error: any) {
        console.error(`[Generation] Job ${job.id} failed:`, error);
        failJob(job.id, error?.message || 'Generation failed');
      }
    })();

    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    console.error('Error in POST /api/programs/generate-engine:', error);
    return NextResponse.json({ error: 'Failed to generate program' }, { status: 500 });
  }
}
