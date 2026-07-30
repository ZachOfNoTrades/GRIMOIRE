import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getNutrientDailySeries } from '../../lib/entryFunctions';

// GET /modules/forage/api/nutrient-daily?code=<code>&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Per-logged-day intake of a single nutrient across the inclusive window. Powers
// the per-nutrient detail page's daily-intake trend chart. Both bounds required
// (the caller resolves the range from the shared range selector).
export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const code = request.nextUrl.searchParams.get('code');
    const startDate = request.nextUrl.searchParams.get('startDate');
    const endDate = request.nextUrl.searchParams.get('endDate');
    if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 });
    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate params required' }, { status: 400 });
    }
    const series = await getNutrientDailySeries(session.user.id!, code, startDate, endDate);
    return NextResponse.json(series);
  } catch (error) {
    console.error('Error in GET /forage/api/nutrient-daily:', error);
    return NextResponse.json({ error: 'Failed to build nutrient daily series' }, { status: 500 });
  }
}
