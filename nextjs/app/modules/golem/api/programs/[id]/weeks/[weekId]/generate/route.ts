import { NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { checkGenerationLimit, logGeneration } from '@/lib/generationLimit';
import { createJob, completeJob, failJob } from '@/lib/generationJobStore';
import { generateNextWeek } from '../../../../../../lib/weekGenerationFunctions';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; weekId: string }> }
) {
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

    const { id, weekId } = await context.params;

    const job = createJob(userId!, "/modules/golem/api/programs/weeks/generate");

    // Fire-and-forget
    (async () => {
      try {
        await generateNextWeek(userId!, id, weekId);

        await logGeneration(userId!, "/modules/golem/api/programs/weeks/generate");
        completeJob(job.id, { success: true });
        console.log(`[Generation] Job ${job.id} completed`);
      } catch (error: any) {
        console.error(`[Generation] Job ${job.id} failed:`, error);
        failJob(job.id, error?.message || "Generation failed");
      }
    })();

    return NextResponse.json({ jobId: job.id }, { status: 202 });

  } catch (error) {
    console.error('Error in POST /api/programs/[id]/weeks/[weekId]/generate:', error);
    return NextResponse.json(
      { error: 'Failed to generate next week' },
      { status: 500 }
    );
  }
}
