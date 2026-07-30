import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getSessionsForCalendar } from '../../../lib/calendarFunctions';

// Returns the user's workout sessions bucketed onto calendar days within a date range.
// Query params: from / to (YYYY-MM-DD, inclusive). Both are required so the client owns the
// visible window (one month grid, plus the adjacent-month padding days).
export async function GET(request: Request) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // Validate the bounds up front — a bare ISO date shape keeps malformed input out of the query.
    const isYmd = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!isYmd(from) || !isYmd(to)) {
      return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 });
    }

    const sessions = await getSessionsForCalendar(userId!, from, to);
    return NextResponse.json(sessions);

  } catch (error) {
    console.error('Error in GET /api/sessions/calendar:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar sessions' },
      { status: 500 }
    );
  }
}
