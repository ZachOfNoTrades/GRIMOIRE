import { NextResponse } from 'next/server';
import { getAuthorizedSession, isAdmin } from '@/lib/permissions';
import { shouldAdminBypassLimit, checkGenerationLimit, logGeneration } from '@/lib/generationLimit';
import { getWorkoutSessionById, getTemplateIdForSession, updateWorkoutSession } from '../../../../lib/workoutSessionFunctions';
import { regenerateSessionPlanWithLlm } from '../../../../lib/llmFunctions';
import { getProgramTemplateById } from '../../../../lib/programTemplateFunctions';
import { getUserProfile } from '../../../../lib/userProfileFunctions';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authSession = await getAuthorizedSession();
    if (!authSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = authSession.user.id;

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

    const { id } = await context.params;

    // Verify session exists
    const session = await getWorkoutSessionById(userId!, id);

    // If program session, fetch week prompt from template
    const templateId = await getTemplateIdForSession(userId!, id);
    let weekContext: string | null = null;
    if (templateId) {
      const programTemplate = await getProgramTemplateById(userId!, templateId);
      weekContext = programTemplate.week_prompt;
    }

    // Load user profile for LLM context
    const userProfile = await getUserProfile(userId!);
    const profileContext = userProfile.profile_prompt;

    // Regenerate plan via LLM
    const plan = await regenerateSessionPlanWithLlm(userId!, weekContext, profileContext, id);

    // Update session with new name and description (preserve all other fields)
    await updateWorkoutSession(
      userId!,
      id,
      plan.name,
      plan.description,
      session.review,
      session.analysis,
      session.started_at,
      session.resumed_at,
      session.duration,
      session.is_current,
      session.is_completed,
    );

    await logGeneration(userId!, "/modules/golem/api/sessions/regenerate-plan");

    // Return the updated session
    const updatedSession = await getWorkoutSessionById(userId!, id);
    return NextResponse.json(updatedSession);

  } catch (error: any) {
    // Handle 404 from getWorkoutSessionById
    if (error?.message?.includes('No workout session found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    // Handle LLM validation errors
    if (error?.message?.includes('LLM returned invalid')) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.error('Error in POST /api/sessions/[id]/regenerate-plan:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate session plan' },
      { status: 500 }
    );
  }
}
