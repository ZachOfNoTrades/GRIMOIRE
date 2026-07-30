import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { createSubtask } from '../../../../lib/taskFunctions';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const title = (body.title ?? '').trim();
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    const subtask = await createSubtask(session.user.id!, id, title);
    if (!subtask) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json(subtask, { status: 201 });
  } catch (error) {
    console.error('Error in POST /quest/api/tasks/[id]/subtasks:', error);
    return NextResponse.json({ error: 'Failed to create subtask' }, { status: 500 });
  }
}
