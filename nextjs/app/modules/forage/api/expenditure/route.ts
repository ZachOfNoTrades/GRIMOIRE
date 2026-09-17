import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getExpenditureSummary } from '../../lib/expenditureSummary';

// Read-only expenditure estimate for the goal wizard's live "initial daily
// budget" preview and for the dashboard's Expenditure card (whose first paint is
// preloaded server-side from the same helper). Returns the floor too so the
// wizard's preview clamps the same way computeTargets does server-side.
export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await getExpenditureSummary(session.user.id!));
  } catch (error) {
    console.error('Error in GET /forage/api/expenditure:', error);
    return NextResponse.json({ error: 'Failed to estimate expenditure' }, { status: 500 });
  }
}
