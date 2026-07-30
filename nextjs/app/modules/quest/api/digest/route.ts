import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { sendDigestForUser } from '../../lib/digestFunctions';
import { clearDigestSent } from '../../lib/settingsFunctions';

// Manual debug trigger. Always sends for the authenticated user, ignoring the enabled/time
// settings — this is exactly what the "Send digest now" button on the settings page hits.
export async function POST(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await sendDigestForUser(session.user.id!, {
      manual: true,
      userName: session.user.name ?? null,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, skipped: result.skipped, error: result.reason ?? 'Failed to send digest' },
        { status: result.skipped ? 503 : 502 },
      );
    }
    return NextResponse.json({ ok: true, today: result.today, trackingId: result.trackingId ?? null });
  } catch (error) {
    console.error('Error in POST /quest/api/digest:', error);
    return NextResponse.json({ error: 'Failed to send digest' }, { status: 500 });
  }
}

// Debug: clear today's "already sent" stamp so the scheduler will resend on its next tick.
export async function DELETE(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await clearDigestSent(session.user.id!);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in DELETE /quest/api/digest:', error);
    return NextResponse.json({ error: 'Failed to clear digest sent stamp' }, { status: 500 });
  }
}
