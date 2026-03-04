import { NextResponse } from 'next/server';
import { getWorkoutSessionById, getTemplateIdForSession } from '../../../../lib/workoutSessionFunctions';
import { generateSessionTargetsWithLlm } from '../../../../lib/llmFunctions';
import { createGeneratedTargets } from '../../../../lib/segmentFunctions';
import { getProgramTemplateById } from '../../../../lib/programTemplateFunctions';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // Verify session exists
    const session = await getWorkoutSessionById(id);

    // If program session, fetch session prompt from template
    const templateId = await getTemplateIdForSession(id);
    let sessionContext: string | null = null;
    if (templateId) {
      const programTemplate = await getProgramTemplateById(templateId);
      sessionContext = programTemplate.session_prompt;
    }

    // Use session notes as the description for LLM generation
    const sessionDescription = session.notes?.trim() || '';
    if (sessionDescription.length === 0) {
      return NextResponse.json({ error: 'Session notes are required for generation' }, { status: 400 });
    }

    // Generate targets via LLM
    const targetExercises = await generateSessionTargetsWithLlm(
      sessionContext,
      session.name,
      sessionDescription,
    );

    await createGeneratedTargets(id, targetExercises);

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