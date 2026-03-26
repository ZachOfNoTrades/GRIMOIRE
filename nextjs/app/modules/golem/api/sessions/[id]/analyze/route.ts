import { NextResponse } from 'next/server';
import { getAuthorizedSession, isAdmin } from '@/lib/permissions';
import { shouldAdminBypassLimit, checkGenerationLimit, logGeneration } from '@/lib/generationLimit';
import { getWorkoutSessionById, getTemplateIdForSession } from '../../../../lib/workoutSessionFunctions';
import { generateSessionAnalysisWithLlm } from '../../../../lib/llmFunctions';
import { getProgramTemplateById } from '../../../../lib/programTemplateFunctions';
import { getUserProfile } from '../../../../lib/userProfileFunctions';
import { getGolemConnection, closeGolemConnection } from '../../../../lib/db';

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

    // Validate session is completed
    if (!session.is_completed) {
      return NextResponse.json({ error: 'Session must be completed before analysis' }, { status: 400 });
    }

    // If program session, fetch analysis prompt from template
    const templateId = await getTemplateIdForSession(userId!, id);
    let analysisContext: string | null = null;
    if (templateId) {
      const programTemplate = await getProgramTemplateById(userId!, templateId);
      analysisContext = programTemplate.analysis_prompt;
    }

    // Load user profile for LLM context
    const userProfile = await getUserProfile(userId!);
    const profileContext = userProfile.profile_prompt;

    // Generate analysis via LLM (LLM queries session data itself via SQL skill)
    const analysis = await generateSessionAnalysisWithLlm(
      userId!,
      analysisContext,
      profileContext,
      id,
      session.review,
    );

    // Save analysis directly to workout_sessions
    let pool;
    try {
      pool = await getGolemConnection();
      await pool.request()
        .input('id', id)
        .input('analysis', analysis)
        .query(`UPDATE workout_sessions SET analysis = @analysis, modified_at = GETDATE() WHERE id = @id`);
    } finally {
      if (pool) {
        await closeGolemConnection(pool);
      }
    }

    await logGeneration(userId!, "/modules/golem/api/sessions/analyze");

    // Return the updated session
    const updatedSession = await getWorkoutSessionById(userId!, id);
    return NextResponse.json(updatedSession);

  } catch (error: any) {
    // Handle 404 from getWorkoutSessionById
    if (error?.message?.includes('No workout session found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error('Error in POST /api/sessions/[id]/analyze:', error);
    return NextResponse.json(
      { error: 'Failed to analyze session' },
      { status: 500 }
    );
  }
}
