import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { migrateTaskToToday } from '../../../../lib/taskFunctions';

// POST /modules/quest/api/tasks/[id]/migrate-to-today
// Carries a daily off a frozen *yesterday* forward to today (after-the-fact freeze carry-over).
// 400 when yesterday isn't frozen or the task isn't an owned daily.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    const task = await migrateTaskToToday(session.user.id!, id);
    if (!task) {
      return NextResponse.json({ error: 'Cannot migrate — yesterday is not frozen or task not found' }, { status: 400 });
    }
    return NextResponse.json(task);
  } catch (error) {
    console.error('Error in POST /quest/api/tasks/[id]/migrate-to-today:', error);
    return NextResponse.json({ error: 'Failed to migrate task' }, { status: 500 });
  }
}
