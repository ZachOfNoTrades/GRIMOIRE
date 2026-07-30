import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { createGoal, endGoal, getActiveGoal } from '../../lib/goalFunctions';
import { repointActiveProgramGoal, seedInitialTargets } from '../../lib/programFunctions';
import { GoalKind } from '../../types/goal';

const ALLOWED: GoalKind[] = ['lose', 'maintain', 'gain'];

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const goal = await getActiveGoal(session.user.id!);
    return NextResponse.json(goal);
  } catch (error) {
    console.error('Error in GET /forage/api/goal:', error);
    return NextResponse.json({ error: 'Failed to load goal' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const goal_kind = body.goal_kind as GoalKind;
    if (!ALLOWED.includes(goal_kind)) {
      return NextResponse.json({ error: 'goal_kind must be lose|maintain|gain' }, { status: 400 });
    }
    let rate: number | null = null;
    if (goal_kind !== 'maintain') {
      const r = Number(body.rate_lb_per_week);
      // Range is in lbs/wk: roughly (0, 4.4] — wide enough to cover the previous 2 kg/wk ceiling.
      if (!Number.isFinite(r) || r <= 0 || r > 4.4) {
        return NextResponse.json({ error: 'rate_lb_per_week must be (0, 4.4]' }, { status: 400 });
      }
      rate = r;
    }
    let targetWeight: number | null = null;
    if (goal_kind !== 'maintain' && body.target_weight_lb != null) {
      const w = Number(body.target_weight_lb);
      // 25 kg -> 55 lb, 250 kg -> 551 lb.
      if (!Number.isFinite(w) || w < 55 || w > 551) {
        return NextResponse.json({ error: 'target_weight_lb must be [55, 551]' }, { status: 400 });
      }
      targetWeight = Math.round(w * 100) / 100;
    }
    const goal = await createGoal(session.user.id!, goal_kind, rate, targetWeight);

    // Editing the goal must not leave the active program's macros stale. Re-point
    // the program at the new goal, then recompute its targets from that goal +
    // current weight/expenditure. seedInitialTargets is a no-op for manual
    // programs (user-entered macros) and when no program exists, so this only
    // recomputes coached macros. It returns whether a recompute actually ran, so
    // the client can tailor its confirmation copy.
    await repointActiveProgramGoal(session.user.id!, goal.id);
    const targetsRecomputed = await seedInitialTargets(session.user.id!);
    return NextResponse.json({ ...goal, targets_recomputed: targetsRecomputed }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /forage/api/goal:', error);
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const goal = await getActiveGoal(session.user.id!);
    if (!goal) return NextResponse.json({ error: 'No active goal' }, { status: 404 });
    await endGoal(session.user.id!, goal.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in DELETE /forage/api/goal:', error);
    return NextResponse.json({ error: 'Failed to end goal' }, { status: 500 });
  }
}
