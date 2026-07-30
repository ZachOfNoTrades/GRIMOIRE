import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getDayNote, upsertDayNote } from '../../lib/noteFunctions';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLORS = new Set(['blue', 'green', 'orange', 'red', 'purple']);

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const date = request.nextUrl.searchParams.get('date') ?? '';
  if (!DATE_RE.test(date)) return NextResponse.json({ error: 'date (YYYY-MM-DD) required' }, { status: 400 });
  try {
    const note = await getDayNote(session.user.id!, date);
    return NextResponse.json(note);
  } catch (error) {
    console.error('Error in GET /forage/api/notes:', error);
    return NextResponse.json({ error: 'Failed to load note' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const date = String(body.date ?? '');
    if (!DATE_RE.test(date)) return NextResponse.json({ error: 'date (YYYY-MM-DD) required' }, { status: 400 });
    const note = String(body.note ?? '');
    const color = body.color_tag == null ? null : String(body.color_tag);
    if (color && !COLORS.has(color)) return NextResponse.json({ error: 'invalid color_tag' }, { status: 400 });
    const saved = await upsertDayNote(session.user.id!, date, note, color);
    return NextResponse.json(saved);
  } catch (error) {
    console.error('Error in PUT /forage/api/notes:', error);
    return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
  }
}
