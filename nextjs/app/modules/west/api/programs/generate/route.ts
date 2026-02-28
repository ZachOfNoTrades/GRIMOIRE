import { NextResponse } from 'next/server';
import { getAllExercisesWithMuscleGroups } from '../../../lib/exerciseFunctions';
import { createProgram } from '../../../lib/programFunctions';
import { generateProgram, validateGeneratedPayload } from '../../../lib/llmFunctions';

export async function POST(request: Request) {
  try {
    const { userPrompt, startDate } = await request.json();

    // Validate inputs
    if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
      return NextResponse.json(
        { error: 'userPrompt is required' },
        { status: 400 }
      );
    }

    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return NextResponse.json(
        { error: 'startDate is required in YYYY-MM-DD format' },
        { status: 400 }
      );
    }

    const exercises = await getAllExercisesWithMuscleGroups();
    const validExerciseIds = new Set(exercises.map(e => e.id)); // Used after LLM generation to verify no hallucinated exercise IDs

    const { programPayload } = await generateProgram({ userPrompt, startDate }, exercises);

    // Validate the generated payload
    const validation = validateGeneratedPayload(programPayload, validExerciseIds);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Generated program failed validation', details: validation.errors },
        { status: 422 }
      );
    }

    // Add program to database
    const programId = await createProgram(programPayload);
    return NextResponse.json({ id: programId }, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/programs/generate:', error);

    if (error instanceof Error) {
      // Missing or unsupported LLM_PROVIDER
      if (error.message.includes('LLM_PROVIDER')) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }

      // LLM provider not found or failed to start
      if (error.message.includes('Failed to start')) {
        return NextResponse.json(
          { error: error.message },
          { status: 503 }
        );
      }

      // LLM provider exited with non-zero code
      if (error.message.includes('exited with code')) {
        return NextResponse.json(
          { error: error.message },
          { status: 502 }
        );
      }

      // JSON parse failure
      if (error.message.includes('Failed to parse')) {
        return NextResponse.json(
          { error: error.message },
          { status: 422 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to generate program' },
      { status: 500 }
    );
  }
}
