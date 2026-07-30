import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getRangeTotals } from '../../lib/entryFunctions';

// GET /modules/forage/api/nutrition-summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Per-logged-day average nutrient intake across the inclusive window. Powers the
// nutrition overview's date-range view and the per-nutrient detail page's
// average-intake line. Both bounds are required (the caller resolves the range).
export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const startDate = request.nextUrl.searchParams.get('startDate');
    const endDate = request.nextUrl.searchParams.get('endDate');
    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate params required' }, { status: 400 });
    }
    const summary = await getRangeTotals(session.user.id!, startDate, endDate);
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Error in GET /forage/api/nutrition-summary:', error);
    return NextResponse.json({ error: 'Failed to build nutrition summary' }, { status: 500 });
  }
}
