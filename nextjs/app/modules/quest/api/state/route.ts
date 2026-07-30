import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import {
  ensureUserState,
  setUserState,
  adjustBalanceTo,
  getReviewCompletionCache,
} from '../../lib/userStateFunctions';
import { getCurrentDate } from '../../lib/settingsFunctions';

export async function GET(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    // Damage check is deferred until the user acknowledges the previous-day review modal so
    // they get a chance to backdate any forgotten completions before HP is deducted.
    const state = await ensureUserState(session.user.id!);
    const today = await getCurrentDate(session.user.id!);
    const reviewPending = (state.last_review_ack_date ?? '') < today;
    // Surface the cached previous-review selections so the modal can pre-fill its checkboxes
    // after a debug clearTodayReview repops it. The client decides whether to honour the cache
    // by matching its `date` against the current review date.
    const reviewCompletion = await getReviewCompletionCache(session.user.id!);
    return NextResponse.json({ state, damage: null, reviewPending, today, reviewCompletion });
  } catch (error) {
    console.error('Error in GET /quest/api/state:', error);
    return NextResponse.json({ error: 'Failed to load state' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const state = await ensureUserState(session.user.id!);
    const health = body.health !== undefined ? Number(body.health) : state.health;
    const maxHealth = body.max_health !== undefined ? Number(body.max_health) : state.max_health;
    if (!Number.isFinite(health) || health < 0) {
      return NextResponse.json({ error: 'health must be non-negative' }, { status: 400 });
    }
    if (!Number.isFinite(maxHealth) || maxHealth < 1) {
      return NextResponse.json({ error: 'max_health must be >= 1' }, { status: 400 });
    }
    const updated = await setUserState(session.user.id!, health, maxHealth);
    let balanceDelta = 0;
    if (body.balance !== undefined && body.balance !== null) {
      const target = Number(body.balance);
      if (!Number.isFinite(target) || target < 0) {
        return NextResponse.json({ error: 'balance must be non-negative' }, { status: 400 });
      }
      const { delta } = await adjustBalanceTo(session.user.id!, target);
      balanceDelta = delta;
    }
    return NextResponse.json({ state: updated, balance_delta: balanceDelta });
  } catch (error) {
    console.error('Error in PUT /quest/api/state:', error);
    return NextResponse.json({ error: 'Failed to update state' }, { status: 500 });
  }
}
