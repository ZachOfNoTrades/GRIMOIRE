import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getWorkoutSessionById } from '../../../../lib/workoutSessionFunctions';
import { getAllExercisesWithMuscleGroups } from '../../../../lib/exerciseFunctions';
import { callLLM, parseLLMResponse } from '../../../../lib/llmFunctions';
import { updateSegments, getSegmentsAndTargets } from '../../../../lib/segmentFunctions';
import { SegmentWithSets } from '../../../../types/segment';

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
    const { description } = await request.json();

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }

    // Verify session exists and is standalone (not part of a program)
    const session = await getWorkoutSessionById(id);
    if (session.week_id !== null) {
      return NextResponse.json(
        { error: 'Cannot generate exercises for a program session' },
        { status: 400 }
      );
    }

    // Fetch exercise list for the prompt
    const exercises = await getAllExercisesWithMuscleGroups();
    const validExerciseIds = new Set(exercises.map(e => e.id));
    const exerciseListJson = JSON.stringify(exercises, null, 2);

    // Build prompt from template
    const templatePath = join(process.cwd(), 'nextjs', 'app', 'modules', 'west', 'lib', 'prompts', 'generateSession.md');
    const template = readFileSync(templatePath, 'utf-8');

    const prompt = template
      .replace('{{SESSION_NAME}}', session.name)
      .replace('{{USER_DESCRIPTION}}', description.trim())
      .replace('{{EXERCISE_LIST}}', exerciseListJson);

    // Call LLM
    console.log(`[GenerateSession] Calling LLM for session '${session.name}' with description: '${description.trim()}'`);
    const rawContent = await callLLM(prompt);

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

    // Convert LLM output to SegmentWithSets[] format
    const segments: SegmentWithSets[] = parsed.target_exercises.map((te) => {
      const segmentId = crypto.randomUUID();
      const exerciseName = exercises.find(e => e.id === te.exercise_id)?.name || '';

      return {
        id: segmentId,
        session_id: id,
        exercise_id: te.exercise_id,
        exercise_name: exerciseName,
        target_id: null,
        order_index: te.order_index,
        notes: null,
        created_at: new Date(),
        modified_at: new Date(),
        sets: te.sets.map((s) => ({
          id: crypto.randomUUID(),
          session_segment_id: segmentId,
          set_number: s.set_number,
          is_warmup: s.is_warmup,
          reps: s.reps,
          weight: s.weight,
          rpe: s.rpe,
          notes: null,
          is_completed: false,
          created_at: new Date(),
          modified_at: new Date(),
        })),
        target: null,
      };
    });

    // Save to database
    await updateSegments(id, segments);

    // Return updated segments (same shape as GET exercises endpoint)
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
