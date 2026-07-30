import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getActiveProgram } from '../../../../lib/programFunctions';
import { sendCheckinReminder } from '../../../../lib/checkinNotif';

// Debug/utility: fire the check-in reminder email right now, bypassing the schedule + due-state
// gates, so the user can confirm notifications are wired up (mirrors quest's digest "send"
// button). Uses the active program's weekday for the body copy when available.
export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const program = await getActiveProgram(session.user.id!);
    const weekday = program?.program_style === 'coached' ? program.check_in_weekday : null;
    const result = await sendCheckinReminder(session.user.id!, weekday, {
      userEmail: session.user.email ?? null,
      userName: session.user.name ?? null,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? 'email send failed', trackingId: result.trackingId },
        { status: result.skipped ? 503 : 502 },
      );
    }
    return NextResponse.json({ ok: true, trackingId: result.trackingId });
  } catch (error) {
    console.error('Error in POST /forage/api/settings/check-in/test:', error);
    return NextResponse.json({ error: 'Failed to send test reminder' }, { status: 500 });
  }
}
