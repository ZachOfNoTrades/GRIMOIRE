import { NextResponse } from 'next/server';
import { generatePowerliftingProgram } from '../../../lib/powerliftingProgramGenerator';
import { createProgram } from '../../../lib/programFunctions';

export async function POST(request: Request) {
  try {
    const {
      squatExerciseId,
      benchExerciseId,
      deadliftExerciseId,
      squat1RM,
      bench1RM,
      deadlift1RM,
      totalWeeks,
      daysPerWeek,
    } = await request.json();

    // Validate exercise IDs
    if (!squatExerciseId || typeof squatExerciseId !== 'string') {
      return NextResponse.json({ error: 'squatExerciseId is required' }, { status: 400 });
    }
    if (!benchExerciseId || typeof benchExerciseId !== 'string') {
      return NextResponse.json({ error: 'benchExerciseId is required' }, { status: 400 });
    }
    if (!deadliftExerciseId || typeof deadliftExerciseId !== 'string') {
      return NextResponse.json({ error: 'deadliftExerciseId is required' }, { status: 400 });
    }

    // Validate 1RMs
    if (typeof squat1RM !== 'number' || squat1RM <= 0) {
      return NextResponse.json({ error: 'squat1RM must be a positive number' }, { status: 400 });
    }
    if (typeof bench1RM !== 'number' || bench1RM <= 0) {
      return NextResponse.json({ error: 'bench1RM must be a positive number' }, { status: 400 });
    }
    if (typeof deadlift1RM !== 'number' || deadlift1RM <= 0) {
      return NextResponse.json({ error: 'deadlift1RM must be a positive number' }, { status: 400 });
    }

    // Validate days per week
    if (typeof daysPerWeek !== 'number' || !Number.isInteger(daysPerWeek) || daysPerWeek < 1) {
      return NextResponse.json({ error: 'daysPerWeek must be a positive integer' }, { status: 400 });
    }

    // Validate total weeks
    if (typeof totalWeeks !== 'number' || !Number.isInteger(totalWeeks) || totalWeeks < 1) {
      return NextResponse.json({ error: 'totalWeeks must be a positive integer' }, { status: 400 });
    }

    // Generate program payload via algorithm
    const payload = generatePowerliftingProgram({
      squatExerciseId,
      benchExerciseId,
      deadliftExerciseId,
      squat1RM,
      bench1RM,
      deadlift1RM,
      totalWeeks,
      daysPerWeek,
    });

    // Save to database
    const programId = await createProgram(payload);
    return NextResponse.json({ id: programId }, { status: 201 });

  } catch (error) {
    console.error('Error in POST /api/programs/generate-powerlifting:', error);
    return NextResponse.json(
      { error: 'Failed to generate powerlifting program' },
      { status: 500 }
    );
  }
}
