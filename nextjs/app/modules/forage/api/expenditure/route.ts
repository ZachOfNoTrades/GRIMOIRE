import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getLatestWeightLb } from '../../lib/weightFunctions';
import { getActiveProgram } from '../../lib/programFunctions';
import { estimateExpenditure } from '../../lib/expenditure';
import { FLOOR_MIN_KCAL } from '../../lib/program';
import { TrainingKind } from '../../types/program';

// Read-only expenditure estimate for the goal wizard's live "initial daily
// budget" preview. The wizard runs BEFORE the program step, so it has no
// training_kind / floor_kind of its own — we borrow them from the active
// program if one exists (else safe defaults). The adaptive estimate already
// reflects real activity, so the training multiplier only matters for the
// formula fallback. Returns the floor too so the wizard's preview clamps the
// same way computeTargets does server-side.
export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const [weightLb, program] = await Promise.all([
      getLatestWeightLb(session.user.id!),
      getActiveProgram(session.user.id!),
    ]);
    const trainingKind: TrainingKind = (program?.training_kind as TrainingKind) ?? 'none';
    const floorKcal = FLOOR_MIN_KCAL[program?.floor_kind ?? 'standard'];

    const expenditure = await estimateExpenditure(session.user.id!, {
      trainingKind,
      latestWeightLb: weightLb,
    });

    return NextResponse.json({
      expenditure_kcal: expenditure.expenditure_kcal,
      method: expenditure.method,
      floor_kcal: floorKcal,
      latest_weight_lb: weightLb,
      logged_days: expenditure.logged_days,
      weigh_ins: expenditure.weigh_ins,
      avg_intake_kcal: expenditure.avg_intake_kcal,
      weight_trend_lb_per_week: expenditure.weight_trend_lb_per_week,
      window_days: expenditure.window_days,
      balance_start_date: expenditure.balance_start_date,
      balance_end_date: expenditure.balance_end_date,
    });
  } catch (error) {
    console.error('Error in GET /forage/api/expenditure:', error);
    return NextResponse.json({ error: 'Failed to estimate expenditure' }, { status: 500 });
  }
}
