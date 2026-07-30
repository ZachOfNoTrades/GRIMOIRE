import { NextRequest, NextResponse } from 'next/server';
import {
  verifyUnsubscribeToken,
  KIND_LABELS,
  UnsubscribeTarget,
} from '@/lib/emailUnsubscribe';
import { applyUnsubscribe } from '@/lib/emailUnsubscribeStore';

// Public by design — an unsubscribe has to work for someone who is not signed in, which is why
// middleware.ts excludes this path. The HMAC token IS the authorization: it names exactly one
// user and one notification kind and can only be minted by the server (see lib/emailUnsubscribe).
//
// POST is the acting verb, hit by both the confirmation page and, per RFC 8058, mail clients
// firing List-Unsubscribe one-click.

function readToken(request: NextRequest, bodyToken?: string): string | null {
  return bodyToken || request.nextUrl.searchParams.get('token');
}

export async function POST(request: NextRequest) {
  // One-click clients send `List-Unsubscribe=One-Click` as a form body with the token in the
  // query string; our own page sends JSON. Accept either without letting a parse failure 500.
  let bodyToken: string | undefined;
  let override: string | undefined;
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      const body = await request.json();
      bodyToken = typeof body?.token === 'string' ? body.token : undefined;
      override = typeof body?.kind === 'string' ? body.kind : undefined;
    }
  } catch {
    // Empty or malformed body — fall back to the query-string token.
  }

  const token = readToken(request, bodyToken);
  if (!token) return NextResponse.json({ error: 'Missing unsubscribe token' }, { status: 400 });

  const verified = verifyUnsubscribeToken(token);
  if (!verified) {
    return NextResponse.json({ error: 'Invalid or expired unsubscribe link' }, { status: 400 });
  }

  // The page's "turn everything off" button reuses the same single-kind token rather than
  // needing a second one; `all` is the only widening we allow, and only for that user.
  const target: UnsubscribeTarget = override === 'all' ? 'all' : verified.kind;

  try {
    await applyUnsubscribe(verified.userId, target);
    return NextResponse.json({ ok: true, kind: target, label: KIND_LABELS[target] });
  } catch (error) {
    console.error(`Error in POST /api/email/unsubscribe for kind '${target}':`, error);
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
  }
}

// Some mail clients and link scanners only issue GETs. Report what the token resolves to so the
// confirmation page can render it, but never mutate on a GET — a scanner must not be able to
// unsubscribe someone by prefetching the link.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing unsubscribe token' }, { status: 400 });

  const verified = verifyUnsubscribeToken(token);
  if (!verified) {
    return NextResponse.json({ error: 'Invalid or expired unsubscribe link' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, kind: verified.kind, label: KIND_LABELS[verified.kind] });
}
