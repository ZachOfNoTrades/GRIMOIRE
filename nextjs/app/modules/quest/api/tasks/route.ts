import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listTasks, createTask } from '../../lib/taskFunctions';
import { Difficulty, DIFFICULTY_ORDER, TaskKind, TASK_KINDS } from '../../types/task';

// Coerce a request value into a grace-window length in days (>=1), defaulting to 1.
function parseWindowDays(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

// Coerce a request value into a manual reward override: null/undefined/empty/invalid -> null (no
// override); a finite, non-negative number -> that number.
function parseManualReward(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function GET(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const tasks = await listTasks(session.user.id!);
    return NextResponse.json(tasks);
  } catch (error) {
    console.error('Error in GET /quest/api/tasks:', error);
    return NextResponse.json({ error: 'Failed to list tasks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const title = (body.title ?? '').trim();
    const difficulty = body.difficulty as Difficulty;
    const kind = (body.kind ?? 'todo') as TaskKind;
    const subtaskTitles: string[] = Array.isArray(body.subtasks)
      ? body.subtasks.filter((s: unknown) => typeof s === 'string')
      : [];
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    if (!DIFFICULTY_ORDER.includes(difficulty)) {
      return NextResponse.json({ error: 'Invalid difficulty' }, { status: 400 });
    }
    if (!TASK_KINDS.includes(kind)) {
      return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
    }
    const frequency = body.frequency ?? 'daily';
    const validFreq = ['daily', 'weekly', 'monthly', 'yearly'];
    if (!validFreq.includes(frequency)) {
      return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
    }
    const everyN = Number(body.every_n ?? 1);
    const daysOfWeek = body.days_of_week ?? null;
    const startDate = body.start_date ?? null;
    const reminders = Array.isArray(body.reminders) ? body.reminders : undefined;
    // Manual reward override: null/absent/empty/invalid -> no override; a finite >=0 number sets it.
    const manualReward = parseManualReward(body.manual_reward_override);
    // Optional free-text description/notes; empty/absent -> no description.
    const description = typeof body.description === 'string' ? body.description : null;
    const task = await createTask(session.user.id!, title, difficulty, kind, subtaskTitles, {
      description,
      frequency,
      days_of_week: daysOfWeek,
      every_n: Number.isFinite(everyN) && everyN >= 1 ? Math.floor(everyN) : 1,
      start_date: startDate,
      // Monthly / yearly calendar anchor; the lib drops it for the frequencies it can't apply to.
      repeat_mode: typeof body.repeat_mode === 'string' ? body.repeat_mode : null,
      window_days: parseWindowDays(body.window_days),
      reminders,
      manual_reward_override: manualReward,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('Error in POST /quest/api/tasks:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
