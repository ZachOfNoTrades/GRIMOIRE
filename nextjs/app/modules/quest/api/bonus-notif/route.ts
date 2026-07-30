import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { sendBonusNotifForUser } from '../../lib/bonusNotifFunctions';
import { clearBonusNotifSent } from '../../lib/settingsFunctions';

// Manual debug trigger for the bonus-task notification. Always sends regardless of the
// enabled/time settings and doesn't mark today as sent (so it doesn't suppress the morning send).
export async function POST(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await sendBonusNotifForUser(session.user.id!, {
      manual: true,
      userName: session.user.name ?? null,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, skipped: result.skipped, error: result.reason ?? 'Failed to send bonus notification' },
        { status: result.skipped ? 503 : 502 },
      );
    }
    // Echo the built email back on manual sends so the notification content is verifiable
    // without opening a mailbox (the scheduled send path doesn't surface this).
    return NextResponse.json({
      ok: true,
      today: result.today,
      hadBonus: result.hadBonus,
      email: result.email ?? null,
      trackingId: result.trackingId ?? null,
    });
  } catch (error) {
    console.error('Error in POST /quest/api/bonus-notif:', error);
    return NextResponse.json({ error: 'Failed to send bonus notification' }, { status: 500 });
  }
}

// Debug: clear today's "already sent" stamp so the scheduler will resend on its next tick.
export async function DELETE(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await clearBonusNotifSent(session.user.id!);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in DELETE /quest/api/bonus-notif:', error);
    return NextResponse.json({ error: 'Failed to clear bonus-notif sent stamp' }, { status: 500 });
  }
}
