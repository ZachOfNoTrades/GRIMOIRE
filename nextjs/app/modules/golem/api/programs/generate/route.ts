import { NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { checkGenerationLimit, logGeneration } from '@/lib/generationLimit';
import { createJob, completeJob, failJob } from '@/lib/generationJobStore';
import { generateProgramFromTemplate } from '../../../lib/llmFunctions';

export async function POST(request: Request) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    const { templateId } = await request.json();

    // Validate inputs
    if (!templateId || typeof templateId !== 'string') {
      return NextResponse.json(
        { error: 'templateId is required' },
        { status: 400 }
      );
    }

    const job = createJob(userId!, "/modules/golem/api/programs/generate");

    // Fire-and-forget
    (async () => {
      try {
        const programId = await generateProgramFromTemplate(userId!, templateId);

        await logGeneration(userId!, "/modules/golem/api/programs/generate");
        completeJob(job.id, { id: programId });
        console.log(`[Generation] Job ${job.id} completed`);
      } catch (error: any) {
        console.error(`[Generation] Job ${job.id} failed:`, error);
        failJob(job.id, error?.message || "Generation failed");
      }
    })();

    return NextResponse.json({ jobId: job.id }, { status: 202 });

  } catch (error) {
    console.error('Error in POST /api/programs/generate:', error);
    return NextResponse.json(
      { error: 'Failed to generate program' },
      { status: 500 }
    );
  }
}
