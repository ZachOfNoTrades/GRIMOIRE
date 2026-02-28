import { NextResponse } from 'next/server';
import { generatePowerliftingProgram } from '../../../lib/powerliftingProgramGenerator';
import { createProgram } from '../../../lib/programFunctions';
import { getAllExercisesWithMuscleGroups } from '../../../lib/exerciseFunctions';

export async function POST(request: Request) {
  try {
    const {
      squatExerciseId,
      benchExerciseId,
      deadliftExerciseId,
      squat1RM,
      bench1RM,
      deadlift1RM,
      meetDate,
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

    // Validate days per week (must validate before meet date since min days depends on it)
    if (typeof daysPerWeek !== 'number' || ![3, 4, 5, 6].includes(daysPerWeek)) {
      return NextResponse.json({ error: 'daysPerWeek must be 3, 4, 5, or 6' }, { status: 400 });
    }

    // Validate meet date
    if (!meetDate || !/^\d{4}-\d{2}-\d{2}$/.test(meetDate)) {
      return NextResponse.json({ error: 'meetDate is required in YYYY-MM-DD format' }, { status: 400 });
    }

    const today = new Date();
    const meetDateObj = new Date(meetDate + 'T00:00:00');
    const daysUntilMeet = Math.floor((meetDateObj.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    if (daysUntilMeet < daysPerWeek) {
      return NextResponse.json(
        { error: `Meet date must be at least ${daysPerWeek} days away to fit one week of training.` },
        { status: 400 }
      );
    }

    // Fetch exercise catalog for accessory name lookups
    const exercises = await getAllExercisesWithMuscleGroups();

    // Generate program payload via algorithm
    const payload = generatePowerliftingProgram({
      squatExerciseId,
      benchExerciseId,
      deadliftExerciseId,
      squat1RM,
      bench1RM,
      deadlift1RM,
      meetDate,
      daysPerWeek,
      exerciseCatalog: exercises.map(e => ({ id: e.id, name: e.name })),
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
