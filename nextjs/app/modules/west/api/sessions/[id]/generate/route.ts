import { NextResponse } from 'next/server';
import { getWorkoutSessionById, getTemplateIdForSession } from '../../../../lib/workoutSessionFunctions';
import { generateSessionTargetsWithLlm } from '../../../../lib/llmFunctions';
import { createGeneratedTargets, getSegmentsAndTargets } from '../../../../lib/segmentFunctions';
import { getProgramTemplateById } from '../../../../lib/programTemplateFunctions';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // Verify session exists
    const session = await getWorkoutSessionById(id);

    // Look up template through session's program chain
    const templateId = await getTemplateIdForSession(id);
    if (!templateId) {
      return NextResponse.json(
        { error: 'Session is not linked to a program with a template' },
        { status: 400 }
      );
    }

    // Load session context from template (may be null — formatting rules come from .md file)
    const programTemplate = await getProgramTemplateById(templateId);

    // Use session notes as the description for LLM generation
    const sessionDescription = session.notes?.trim() || '';
    if (sessionDescription.length === 0) {
      return NextResponse.json({ error: 'Session notes are required for generation' }, { status: 400 });
    }

    // Generate targets via LLM
    const targetExercises = await generateSessionTargetsWithLlm(
      programTemplate.session_prompt,
      session.name,
      sessionDescription,
    );

    await createGeneratedTargets(id, targetExercises);

    // Get newly created session segments and targets
    const { exercises: updatedSegments, targets } = await getSegmentsAndTargets(id);

    return NextResponse.json({ exercises: updatedSegments, targets }, { status: 201 });

  } catch (error: any) {
    // Handle 404 from getWorkoutSessionById
    if (error?.message?.includes('No workout session found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    // Handle 404 from getProgramTemplateById
    if (error?.message?.includes('No program template found')) {
      return NextResponse.json({ error: 'Program template not found' }, { status: 404 });
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