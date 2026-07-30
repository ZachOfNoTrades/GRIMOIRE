import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { completeTask } from '../../../../lib/taskFunctions';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    // Optional backdated completion (used by the previous-day review modal)
    let forDate: string | undefined;
    try {
      const body = await request.json();
      if (body && typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
        forDate = body.date;
      }
    } catch {
      // no body / not JSON — proceed without forDate
    }
    const result = await completeTask(session.user.id!, id, forDate ? { forDate } : undefined);
    if (!result) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    // `result.allDailiesBonusAwarded` (when > 0) is a separate payout on top of `awarded` —
    // callers should surface both.
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in POST /quest/api/tasks/[id]/complete:', error);
    return NextResponse.json({ error: 'Failed to complete task' }, { status: 500 });
  }
}
