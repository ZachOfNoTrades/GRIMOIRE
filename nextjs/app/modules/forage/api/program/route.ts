import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { createProgram, getActiveProgram, seedInitialTargets } from '../../lib/programFunctions';
import { setTarget } from '../../lib/targetFunctions';
import { getActiveGoal } from '../../lib/goalFunctions';
import {
  DietKind, DistributionKind, FloorKind, ProgramStyle, ProteinBand, TrainingKind,
} from '../../types/program';

const PROTEIN: ProteinBand[] = ['low', 'moderate', 'high', 'extra_high'];
const DIET: DietKind[] = ['balanced', 'low_fat', 'low_carb', 'keto'];
const TRAINING: TrainingKind[] = ['none', 'lifting', 'cardio', 'cardio_lifting'];
const DISTRIBUTION: DistributionKind[] = ['even', 'shifted'];
const FLOOR: FloorKind[] = ['standard', 'low'];
const STYLE: ProgramStyle[] = ['coached', 'manual'];

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // Purely read-only — the weekly recompute now only happens via the explicit
    // check-in wizard (POST /api/checkin/confirm), never as a side effect of
    // loading the program.
    const program = await getActiveProgram(session.user.id!);
    return NextResponse.json(program);
  } catch (error) {
    console.error('Error in GET /forage/api/program:', error);
    return NextResponse.json({ error: 'Failed to load program' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();

    // Default to 'coached' so older clients that don't send a style still work.
    const style: ProgramStyle = body.program_style ?? 'coached';
    if (!STYLE.includes(style)) return NextResponse.json({ error: 'bad program_style' }, { status: 400 });

    // Every program belongs to the active goal, regardless of style.
    const goalForProgram = await getActiveGoal(session.user.id!);
    if (!goalForProgram) return NextResponse.json({ error: 'No active goal — set goal first' }, { status: 409 });

    // MANUAL STYLE — user types their own weekly targets; no coaching inputs,
    // no check-in. All four values are entered directly; nothing is derived.
    if (style === 'manual') {
      const kcal = Math.round(Number(body.kcal));
      const protein_g = Number(body.protein_g);
      const carbs_g = Number(body.carbs_g);
      const fat_g = Number(body.fat_g);
      if (![kcal, protein_g, carbs_g, fat_g].every((n) => Number.isFinite(n) && n >= 0)) {
        return NextResponse.json({ error: 'kcal/protein_g/carbs_g/fat_g must be non-negative numbers' }, { status: 400 });
      }

      const manualProgram = await createProgram(session.user.id!, goalForProgram.id, {
        program_style: 'manual',
        protein_band: null,
        diet_kind: null,
        training_kind: null,
        distribution_kind: null,
        shifted_high_days: null,
        floor_kind: null,
        check_in_weekday: null,
      });
      // Write the user-entered targets as the active manual target for all days.
      await setTarget(session.user.id!, { kcal, protein_g, carbs_g, fat_g });
      return NextResponse.json(manualProgram, { status: 201 });
    }

    // COACHED STYLE — validate the coaching inputs and let the engine compute targets.
    if (!PROTEIN.includes(body.protein_band)) return NextResponse.json({ error: 'bad protein_band' }, { status: 400 });
    if (!DIET.includes(body.diet_kind)) return NextResponse.json({ error: 'bad diet_kind' }, { status: 400 });
    if (!TRAINING.includes(body.training_kind)) return NextResponse.json({ error: 'bad training_kind' }, { status: 400 });
    if (!DISTRIBUTION.includes(body.distribution_kind)) return NextResponse.json({ error: 'bad distribution_kind' }, { status: 400 });
    if (!FLOOR.includes(body.floor_kind)) return NextResponse.json({ error: 'bad floor_kind' }, { status: 400 });
    const weekday = Number(body.check_in_weekday);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      return NextResponse.json({ error: 'check_in_weekday must be 1..7' }, { status: 400 });
    }
    let shifted: number[] | null = null;
    if (body.distribution_kind === 'shifted') {
      if (!Array.isArray(body.shifted_high_days) || body.shifted_high_days.length === 0) {
        return NextResponse.json({ error: 'shifted_high_days required when distribution_kind=shifted' }, { status: 400 });
      }
      shifted = body.shifted_high_days
        .map((n: any) => Number(n))
        .filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 7);
      if (shifted!.length === 0 || shifted!.length >= 7) {
        return NextResponse.json({ error: 'shifted_high_days must contain 1..6 weekdays' }, { status: 400 });
      }
    }

    const program = await createProgram(session.user.id!, goalForProgram.id, {
      program_style: 'coached',
      protein_band: body.protein_band,
      diet_kind: body.diet_kind,
      training_kind: body.training_kind,
      distribution_kind: body.distribution_kind,
      shifted_high_days: shifted,
      floor_kind: body.floor_kind,
      check_in_weekday: weekday,
    });
    // Immediately compute initial targets
    await seedInitialTargets(session.user.id!);
    return NextResponse.json(program, { status: 201 });
  } catch (error) {
    console.error('Error in POST /forage/api/program:', error);
    return NextResponse.json({ error: 'Failed to create program' }, { status: 500 });
  }
}
