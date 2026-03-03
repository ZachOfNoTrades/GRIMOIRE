import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getWorkoutSessionById } from '../../../../lib/workoutSessionFunctions';
import { getAllExercisesWithMuscleGroups } from '../../../../lib/exerciseFunctions';
import { callLLM, readLLMOutput, parseLLMResponse } from '../../../../lib/llmFunctions';
import { createGeneratedTargets, getSegmentsAndTargets } from '../../../../lib/segmentFunctions';

interface LLMTargetSet {
  set_number: number;
  is_warmup: boolean;
  reps: number;
  weight: number;
  rpe: number | null;
}

interface LLMTargetExercise {
  exercise_id: string;
  order_index: number;
  sets: LLMTargetSet[];
}

interface LLMSessionTargets {
  target_exercises: LLMTargetExercise[];
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    // Verify session exists
    const session = await getWorkoutSessionById(id);

    // Use session notes as the description for LLM generation
    const sessionDescription = session.notes?.trim() || '';
    if (sessionDescription.length === 0) {
      return NextResponse.json({ error: 'Session notes are required for generation' }, { status: 400 });
    }

    // Fetch exercise list for the prompt
    const exercises = await getAllExercisesWithMuscleGroups();
    const validExerciseIds = new Set(exercises.map(e => e.id));
    const exerciseListJson = JSON.stringify(exercises, null, 2);

    // Build prompt from template
    const templatePath = join(process.cwd(), 'app', 'modules', 'west', 'lib', 'prompts', 'generateSession.md');
    const template = readFileSync(templatePath, 'utf-8');

    const prompt = template
      .replace('{{SESSION_NAME}}', session.name)
      .replace('{{USER_DESCRIPTION}}', sessionDescription)
      .replace('{{EXERCISE_LIST}}', exerciseListJson);

    // Call LLM
    console.log(`[GenerateSession] Calling LLM for session '${session.name}' with description: '${sessionDescription}'`);
    const outputFile = await callLLM(prompt);
    const rawContent = readLLMOutput(outputFile);

    // Parse response (reuse parseLLMResponse which strips code fences)
    const parsed = parseLLMResponse(rawContent) as unknown as LLMSessionTargets;

    // Validate the response structure
    if (!parsed.target_exercises || !Array.isArray(parsed.target_exercises)) {
      return NextResponse.json(
        { error: 'LLM returned invalid response structure' },
        { status: 500 }
      );
    }

    // Validate exercise IDs
    const invalidIds = parsed.target_exercises
      .filter(te => !validExerciseIds.has(te.exercise_id))
      .map(te => te.exercise_id);

    if (invalidIds.length > 0) {
      console.error(`[GenerateSession] Invalid exercise IDs from LLM: ${invalidIds.join(', ')}`);
      return NextResponse.json(
        { error: `LLM returned invalid exercise IDs: ${invalidIds.join(', ')}` },
        { status: 500 }
      );
    }

    await createGeneratedTargets(id, parsed.target_exercises);

    // Get newly created session segments and targets
    const { exercises: updatedSegments, targets } = await getSegmentsAndTargets(id);
    console.log(`[GenerateSession] Generated ${updatedSegments.length} exercises for session '${session.name}'`);

    return NextResponse.json({ exercises: updatedSegments, targets }, { status: 201 });

  } catch (error: any) {
    // Handle 404 from getWorkoutSessionById
    if (error?.message?.includes('No workout session found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error('Error in POST /api/sessions/[id]/generate:', error);
    return NextResponse.json(
      { error: 'Failed to generate session exercises' },
      { status: 500 }
    );
  }
}
