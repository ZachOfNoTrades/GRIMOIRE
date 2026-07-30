import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getActiveGoal } from '../../../lib/goalFunctions';
import { getLatestWeightLb } from '../../../lib/weightFunctions';
import { computeTargets } from '../../../lib/program';
import { estimateExpenditure } from '../../../lib/expenditure';
import {
  DietKind, DistributionKind, FloorKind, ProteinBand, TrainingKind,
} from '../../../types/program';

const PROTEIN: ProteinBand[] = ['low', 'moderate', 'high', 'extra_high'];
const DIET: DietKind[] = ['balanced', 'low_fat', 'low_carb', 'keto'];
const TRAINING: TrainingKind[] = ['none', 'lifting', 'cardio', 'cardio_lifting'];
const DISTRIBUTION: DistributionKind[] = ['even', 'shifted'];
const FLOOR: FloorKind[] = ['standard', 'low'];

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    if (!PROTEIN.includes(body.protein_band)) return NextResponse.json({ error: 'bad protein_band' }, { status: 400 });
    if (!DIET.includes(body.diet_kind)) return NextResponse.json({ error: 'bad diet_kind' }, { status: 400 });
    if (!TRAINING.includes(body.training_kind)) return NextResponse.json({ error: 'bad training_kind' }, { status: 400 });
    if (!DISTRIBUTION.includes(body.distribution_kind)) return NextResponse.json({ error: 'bad distribution_kind' }, { status: 400 });
    if (!FLOOR.includes(body.floor_kind)) return NextResponse.json({ error: 'bad floor_kind' }, { status: 400 });
    let shifted: number[] | null = null;
    if (body.distribution_kind === 'shifted') {
      shifted = (Array.isArray(body.shifted_high_days) ? body.shifted_high_days : [])
        .map((n: any) => Number(n))
        .filter((n: number) => Number.isInteger(n) && n >= 1 && n <= 7);
    }
    const goal = await getActiveGoal(session.user.id!);
    if (!goal) return NextResponse.json({ error: 'No active goal' }, { status: 409 });

    const weightLb = await getLatestWeightLb(session.user.id!);

    // Maintenance now comes from demonstrated expenditure (logged intake +
    // weight trend), falling back to the bodyweight formula for thin history.
    const expenditure = await estimateExpenditure(session.user.id!, {
      trainingKind: body.training_kind as TrainingKind,
      latestWeightLb: weightLb,
    });

    const out = computeTargets({
      goal_kind: goal.goal_kind,
      rate_lb_per_week: goal.rate_lb_per_week,
      protein_band: body.protein_band,
      diet_kind: body.diet_kind,
      training_kind: body.training_kind,
      floor_kind: body.floor_kind,
      distribution_kind: body.distribution_kind,
      shifted_high_days: shifted,
      latest_weight_lb: weightLb,
      maintenance_kcal_override: expenditure.expenditure_kcal,
    });

    return NextResponse.json({
      ...out,
      latest_weight_lb: weightLb,
      maintenance_kcal: expenditure.expenditure_kcal,
      expenditure_method: expenditure.method,
      goal_kind: goal.goal_kind,
      rate_lb_per_week: goal.rate_lb_per_week,
    });
  } catch (error) {
    console.error('Error in POST /forage/api/program/preview:', error);
    return NextResponse.json({ error: 'Failed to compute preview' }, { status: 500 });
  }
}
