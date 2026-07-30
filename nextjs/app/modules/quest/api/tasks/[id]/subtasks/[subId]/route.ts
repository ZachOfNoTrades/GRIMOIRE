import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { toggleSubtask, deleteSubtask } from '../../../../../lib/taskFunctions';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; subId: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id, subId } = await params;
    const body = await request.json();
    const done = !!body.done;
    const subtask = await toggleSubtask(session.user.id!, id, subId, done);
    if (!subtask) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(subtask);
  } catch (error) {
    console.error('Error in PATCH /quest/api/tasks/[id]/subtasks/[subId]:', error);
    return NextResponse.json({ error: 'Failed to update subtask' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; subId: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id, subId } = await params;
    const ok = await deleteSubtask(session.user.id!, id, subId);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error in DELETE /quest/api/tasks/[id]/subtasks/[subId]:', error);
    return NextResponse.json({ error: 'Failed to delete subtask' }, { status: 500 });
  }
}
