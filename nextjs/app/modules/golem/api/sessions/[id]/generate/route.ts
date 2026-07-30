import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { checkGenerationLimit, logGeneration } from '@/lib/generationLimit';
import { createJob, completeJob, failJob } from '@/lib/generationJobStore';
import { getWorkoutSessionById, getTemplateIdForSession } from '../../../../lib/workoutSessionFunctions';
import { generateSessionTargetsWithLlm } from '../../../../lib/llmFunctions';
import { createGeneratedTargets, deleteAllTargetsForSession } from '../../../../lib/segmentFunctions';
import { getProgramTemplateById } from '../../../../lib/programTemplateFunctions';
import { getUserProfile } from '../../../../lib/userProfileFunctions';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authSession = await getAuthorizedUser(request);
    if (!authSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = authSession.user.id;

    // Rate limit check
    const { allowed, count, limit } = await checkGenerationLimit(userId!, authSession.user.generationLimit);
    if (!allowed) {
      return NextResponse.json(
        { error: `Generation limit reached (${count}/${limit} in 24h)` },
        { status: 429 }
      );
    }

    const { id } = await context.params;

    // Verify session exists
    const session = await getWorkoutSessionById(userId!, id);

    // If program session, fetch session prompt from template
    const templateId = await getTemplateIdForSession(userId!, id);
    let sessionContext: string | null = null;
    if (templateId) {
      const programTemplate = await getProgramTemplateById(userId!, templateId);
      sessionContext = programTemplate.session_prompt;
    }

    // Load user profile for LLM context
    const userProfile = await getUserProfile(userId!);
    const profileContext = userProfile.profile_prompt;

    // Use session description for LLM generation
    const sessionDescription = session.description?.trim() || '';
    if (sessionDescription.length === 0) {
      return NextResponse.json({ error: 'Session description is required for generation' }, { status: 400 });
    }

    const job = createJob(userId!, "/modules/golem/api/sessions/generate");

    // Fire-and-forget
    (async () => {
      try {
        // Clear existing targets before generating new ones
        await deleteAllTargetsForSession(userId!, id);

        // Generate targets via LLM. This path returns the target segments only;
        // it doesn't surface separate exercise suggestions for approval.
        const targets = await generateSessionTargetsWithLlm(
          userId!,
          sessionContext,
          id,
          session.name,
          sessionDescription,
          profileContext,
        );
        const suggestions: never[] = [];

        // Save targets that reference existing exercises
        await createGeneratedTargets(userId!, id, targets);

        await logGeneration(userId!, "/modules/golem/api/sessions/generate");

        // Include suggested exercises in the job result for user approval
        completeJob(job.id, {
          success: true,
          suggestedExercises: suggestions.length > 0 ? suggestions : undefined,
        });
        console.log(`[Generation] Job ${job.id} completed (${targets.length} targets, ${suggestions.length} suggestions)`);
      } catch (error: any) {
        console.error(`[Generation] Job ${job.id} failed:`, error);
        failJob(job.id, error?.message || "Generation failed");
      }
    })();

    return NextResponse.json({ jobId: job.id }, { status: 202 });

  } catch (error: any) {
    // Handle 404 from getWorkoutSessionById
    if (error?.message?.includes('No workout session found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    // Handle LLM validation errors
    if (error?.message?.includes('LLM returned invalid')) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.error('Error in POST /api/sessions/[id]/generate:', error);
    return NextResponse.json(
      { error: 'Failed to generate session exercises' },
      { status: 500 }
    );
  }
}
