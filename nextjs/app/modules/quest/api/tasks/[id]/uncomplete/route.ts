import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { uncompleteTask } from '../../../../lib/taskFunctions';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const task = await uncompleteTask(session.user.id!, id);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json(task);
  } catch (error) {
    console.error('Error in POST /quest/api/tasks/[id]/uncomplete:', error);
    return NextResponse.json({ error: 'Failed to uncomplete task' }, { status: 500 });
  }
}
