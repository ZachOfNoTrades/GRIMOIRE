import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { deleteTask, updateTask } from '../../../lib/taskFunctions';
import { Difficulty, DIFFICULTY_ORDER, TaskKind, TASK_KINDS, Frequency } from '../../../types/task';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const patch: Parameters<typeof updateTask>[2] = {};
    if (body.title !== undefined) patch.title = String(body.title);
    // Description: explicit null/empty clears it; a string sets it; omitting leaves it unchanged.
    if (body.description !== undefined) {
      patch.description = body.description === null || body.description === '' ? null : String(body.description);
    }
    if (body.difficulty !== undefined) {
      if (!DIFFICULTY_ORDER.includes(body.difficulty as Difficulty)) {
        return NextResponse.json({ error: 'Invalid difficulty' }, { status: 400 });
      }
      patch.difficulty = body.difficulty as Difficulty;
    }
    if (body.kind !== undefined) {
      if (!TASK_KINDS.includes(body.kind)) {
        return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
      }
      patch.kind = body.kind as TaskKind;
    }
    if (body.frequency !== undefined) {
      const validFreq = ['daily', 'weekly', 'monthly', 'yearly'];
      if (!validFreq.includes(body.frequency)) {
        return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
      }
      patch.frequency = body.frequency as Frequency;
    }
    if (body.every_n !== undefined) {
      const n = Number(body.every_n);
      if (!Number.isFinite(n) || n < 1) {
        return NextResponse.json({ error: 'every_n must be >= 1' }, { status: 400 });
      }
      patch.every_n = Math.floor(n);
    }
    if (body.days_of_week !== undefined) patch.days_of_week = body.days_of_week || null;
    if (body.start_date !== undefined) patch.start_date = body.start_date || null;
    // Completion grace window in days (>=1; 1 = scheduled day only).
    if (body.window_days !== undefined) {
      const n = Number(body.window_days);
      if (!Number.isFinite(n) || n < 1) {
        return NextResponse.json({ error: 'window_days must be >= 1' }, { status: 400 });
      }
      patch.window_days = Math.floor(n);
    }
    if (body.reminders !== undefined) {
      if (!Array.isArray(body.reminders)) {
        return NextResponse.json({ error: 'reminders must be an array' }, { status: 400 });
      }
      patch.reminders = body.reminders;
    }
    // Manual reward override: explicit null/empty/invalid clears it; a finite >=0 number sets it;
    // omitting the key leaves it unchanged (partial update).
    if (body.manual_reward_override !== undefined) {
      const raw = body.manual_reward_override;
      if (raw === null || raw === '') {
        patch.manual_reward_override = null;
      } else {
        const n = Number(raw);
        patch.manual_reward_override = Number.isFinite(n) && n >= 0 ? n : null;
      }
    }
    const task = await updateTask(session.user.id!, id, patch);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json(task);
  } catch (error) {
    console.error('Error in PUT /quest/api/tasks/[id]:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    const ok = await deleteTask(session.user.id!, id);
    if (!ok) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /quest/api/tasks/[id]:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
