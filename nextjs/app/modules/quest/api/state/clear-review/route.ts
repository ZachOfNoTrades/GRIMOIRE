import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { clearTodayReview, ensureUserState } from '../../../lib/userStateFunctions';

export async function POST(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await clearTodayReview(session.user.id!);
    const state = await ensureUserState(session.user.id!);
    return NextResponse.json({ state, ...result });
  } catch (error) {
    console.error('Error in POST /quest/api/state/clear-review:', error);
    return NextResponse.json({ error: 'Failed to clear review' }, { status: 500 });
  }
}
