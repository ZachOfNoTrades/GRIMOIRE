import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { reorderSubtasks } from '../../../../../lib/taskFunctions';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const ids = body?.ids;
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) {
      return NextResponse.json({ error: 'ids must be a string array' }, { status: 400 });
    }
    const subtasks = await reorderSubtasks(session.user.id!, id, ids);
    if (!subtasks) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json(subtasks);
  } catch (error) {
    console.error('Error in PUT /quest/api/tasks/[id]/subtasks/reorder:', error);
    return NextResponse.json({ error: 'Failed to reorder subtasks' }, { status: 500 });
  }
}
