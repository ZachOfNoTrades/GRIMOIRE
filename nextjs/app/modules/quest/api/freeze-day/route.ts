import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import {
  freezeDay,
  listFrozenDays,
  unfreezeDay,
} from '../../lib/freezeDayFunctions';

function parseDateBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const d = (body as { date?: unknown }).date;
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d;
}

function parseDeferTaskIds(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const raw = (body as { deferTaskIds?: unknown }).deferTaskIds;
  if (!Array.isArray(raw)) return [];
  // Loose-validate UUID shape; freezeDay sanitises again before binding to sql.UniqueIdentifier.
  return raw.filter((v): v is string => typeof v === 'string' && /^[0-9a-fA-F-]{36}$/.test(v));
}

export async function GET(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const days = await listFrozenDays(session.user.id!);
    return NextResponse.json({ days });
  } catch (error) {
    console.error('Error in GET /quest/api/freeze-day:', error);
    return NextResponse.json({ error: 'Failed to list frozen days' }, { status: 500 });
  }
}

// POST { date: 'YYYY-MM-DD' } — freezes that date for the caller. Forfeits any daily-task
// rewards credited on @date and shields the date from the next daily damage check.
export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let date: string | null = null;
  let deferTaskIds: string[] = [];
  try {
    const body = await request.json();
    date = parseDateBody(body);
    deferTaskIds = parseDeferTaskIds(body);
  } catch {
    date = null;
  }
  if (!date) {
    return NextResponse.json({ error: "Body must include 'date' as 'YYYY-MM-DD'" }, { status: 400 });
  }
  try {
    const result = await freezeDay(session.user.id!, date, { deferTaskIds });
    return NextResponse.json({ ok: true, date, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // freezeDay throws with a recognisable prefix on bad input; surface those as 400 so the
    // client can show the message instead of a generic 500.
    if (msg.startsWith('Invalid date') || msg.startsWith('Freeze date must be before today')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error('Error in POST /quest/api/freeze-day:', error);
    return NextResponse.json({ error: 'Failed to freeze day' }, { status: 500 });
  }
}

// DELETE { date: 'YYYY-MM-DD' } — removes the freeze marker. Does NOT restore ledger rows
// the freeze deleted; this is a "lift the dedupe" action for cases where the user changed
// their mind or froze the wrong date.
export async function DELETE(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let date: string | null = null;
  try {
    date = parseDateBody(await request.json());
  } catch {
    date = null;
  }
  if (!date) {
    return NextResponse.json({ error: "Body must include 'date' as 'YYYY-MM-DD'" }, { status: 400 });
  }
  try {
    const result = await unfreezeDay(session.user.id!, date);
    return NextResponse.json({ ok: true, date, ...result });
  } catch (error) {
    console.error('Error in DELETE /quest/api/freeze-day:', error);
    return NextResponse.json({ error: 'Failed to unfreeze day' }, { status: 500 });
  }
}
