import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { deleteWeight } from '../../../lib/weightFunctions';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { date } = await params;
  try {
    await deleteWeight(session.user.id!, date);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in DELETE /forage/api/weight/[date]:', error);
    return NextResponse.json({ error: 'Failed to delete weight' }, { status: 500 });
  }
}
