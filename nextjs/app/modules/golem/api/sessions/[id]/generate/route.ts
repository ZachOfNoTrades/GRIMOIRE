import { NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
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
    const authSession = await getAuthorizedSession();
    if (!authSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = authSession.user.id;

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

    // Clear existing targets before generating new ones
    await deleteAllTargetsForSession(userId!, id);

    // Generate targets via LLM
    const targetExercises = await generateSessionTargetsWithLlm(
      userId!,
      sessionContext,
      id,
      session.name,
      sessionDescription,
      profileContext,
    );

    await createGeneratedTargets(userId!, id, targetExercises);

    return NextResponse.json({ success: true }, { status: 201 });

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