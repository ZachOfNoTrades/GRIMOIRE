import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listCompletionsInRange } from '../../../lib/taskFunctions';
import { listFrozenDaysInRange } from '../../../lib/freezeDayFunctions';

// GET /modules/quest/api/tasks/completions?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns the user's dated task completions AND frozen (excused) days within the (inclusive) range.
// The calendar overlays both on the schedule it derives from the task cadence fields to render
// done/missed/frozen per day.
export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    if (!from || !to || !ymd.test(from) || !ymd.test(to)) {
      return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 });
    }
    if (from > to) {
      return NextResponse.json({ error: 'from must be on or before to' }, { status: 400 });
    }
    const [completions, frozenDays] = await Promise.all([
      listCompletionsInRange(session.user.id!, from, to),
      listFrozenDaysInRange(session.user.id!, from, to),
    ]);
    return NextResponse.json({ completions, frozenDays });
  } catch (error) {
    console.error('Error in GET /quest/api/tasks/completions:', error);
    return NextResponse.json({ error: 'Failed to load completions' }, { status: 500 });
  }
}
