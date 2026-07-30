import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getForcedTodoBonusId, setForcedTodoBonusId } from '../../../lib/settingsFunctions';

// Debug-only endpoint: force which todo gets today's random bonus (or clear the override). The
// override persists until cleared — handy for testing the bonus path without waiting for a roll
// to hit. Permission guard is the standard authorised-session check; no role gate (any signed-in
// user can force a bonus on their own todos).

export async function GET(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const forcedId = await getForcedTodoBonusId(session.user.id!);
    return NextResponse.json({ forcedTodoBonusId: forcedId });
  } catch (error) {
    console.error('Error in GET /quest/api/debug/force-bonus:', error);
    return NextResponse.json({ error: 'Failed to load force-bonus override' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    let taskId: string | null;
    if (body?.taskId === undefined || body.taskId === null || body.taskId === '') {
      taskId = null;
    } else if (typeof body.taskId === 'string' && /^[0-9a-fA-F-]{36}$/.test(body.taskId)) {
      taskId = body.taskId;
    } else {
      return NextResponse.json({ error: 'taskId must be a UUID string or null' }, { status: 400 });
    }
    await setForcedTodoBonusId(session.user.id!, taskId);
    return NextResponse.json({ forcedTodoBonusId: taskId });
  } catch (error) {
    console.error('Error in POST /quest/api/debug/force-bonus:', error);
    return NextResponse.json({ error: 'Failed to set force-bonus override' }, { status: 500 });
  }
}
