import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { reorderTasks } from '../../../lib/taskFunctions';

export async function PUT(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const ids = body?.ids;
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) {
      return NextResponse.json({ error: 'ids must be a string array' }, { status: 400 });
    }
    await reorderTasks(session.user.id!, ids);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in PUT /quest/api/tasks/reorder:', error);
    return NextResponse.json({ error: 'Failed to reorder' }, { status: 500 });
  }
}
