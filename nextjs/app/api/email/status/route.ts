import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { isSmtpConfigured } from '@/lib/email';
import { getGmailSender, isGoogleMailConfigured } from '@/lib/googleMail';

// How this user's notification emails will actually be delivered — the question every
// notification settings screen needs to answer before it promises anything. A toggle that says
// "get an email nudge" is a lie if nothing can send, which is the state the app sat in until
// Gmail delivery landed, so <EmailDeliveryStatus> shows this beside each of those toggles.
export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const sender = isGoogleMailConfigured() ? await getGmailSender(session.user.id!) : null;
    return NextResponse.json({
      // 'gmail' = sending from the user's own mailbox, 'smtp' = a configured mail server,
      // null = nothing can send for this user yet. Mirrors resolveTransport() in lib/email.ts.
      transport: sender ? 'gmail' : isSmtpConfigured() ? 'smtp' : null,
      // Whether re-signing in with Google would fix a null transport.
      canConnectGmail: isGoogleMailConfigured(),
      address: sender?.address ?? session.user.email ?? null,
    });
  } catch (error) {
    console.error('Error in GET /api/email/status:', error);
    return NextResponse.json({ error: 'Failed to read email delivery status' }, { status: 500 });
  }
}
