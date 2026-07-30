import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { endProgram, updateCheckInDay } from '../../../lib/programFunctions';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const weekday = Number(body.check_in_weekday);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      return NextResponse.json({ error: 'check_in_weekday must be 1..7' }, { status: 400 });
    }
    await updateCheckInDay(session.user.id!, id, weekday);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in PATCH /forage/api/program/[id]:', error);
    return NextResponse.json({ error: 'Failed to update program' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    await endProgram(session.user.id!, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in DELETE /forage/api/program/[id]:', error);
    return NextResponse.json({ error: 'Failed to end program' }, { status: 500 });
  }
}
