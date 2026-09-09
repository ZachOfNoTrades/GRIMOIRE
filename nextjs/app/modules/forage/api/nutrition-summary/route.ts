import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getRangeTotals } from '../../lib/entryFunctions';

// Both bounds go straight into a date-typed query; anything that isn't a plain
// ISO day is caller error, not a server fault, so it gets a 400 instead of
// reaching the DB and coming back as a 500 (matches the notes route).
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Shape alone isn't enough — "2026-13-45" matches the pattern and still explodes
// in the query, and "2026-02-30" silently rolls over to March 2. Round-tripping
// through Date rejects both: only a real calendar day formats back to itself.
const isIsoDay = (value: string) => {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

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
    if (!isIsoDay(startDate) || !isIsoDay(endDate)) {
      return NextResponse.json({ error: 'startDate and endDate must be YYYY-MM-DD' }, { status: 400 });
    }
    const summary = await getRangeTotals(session.user.id!, startDate, endDate);
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Error in GET /forage/api/nutrition-summary:', error);
    return NextResponse.json({ error: 'Failed to build nutrition summary' }, { status: 500 });
  }
}
