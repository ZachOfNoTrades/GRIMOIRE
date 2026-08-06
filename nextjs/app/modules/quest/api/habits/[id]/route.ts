import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { updateHabit, deleteHabit } from '../../../lib/habitFunctions';
import { Difficulty, DIFFICULTY_ORDER } from '../../../types/task';

// Coerce a request value into a manual reward override: null/undefined/empty/invalid -> null (no
// override); a finite, non-negative number -> that number.
function parseManualReward(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const title = (body.title ?? '').trim();
    const difficulty = body.difficulty as Difficulty;
    const allowPositive = body.allow_positive !== false;
    const allowNegative = body.allow_negative !== false;
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    if (!DIFFICULTY_ORDER.includes(difficulty)) {
      return NextResponse.json({ error: 'Invalid difficulty' }, { status: 400 });
    }
    if (!allowPositive && !allowNegative) {
      return NextResponse.json({ error: 'Habit must allow at least one direction' }, { status: 400 });
    }
    // Manual reward override: null/absent/empty/invalid -> clears the override.
    const manualReward = parseManualReward(body.manual_reward_override);
    const habit = await updateHabit(session.user.id!, id, {
      title,
      difficulty,
      allowPositive,
      allowNegative,
      manualRewardOverride: manualReward,
    });
    if (!habit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(habit);
  } catch (error) {
    console.error('Error in PUT /quest/api/habits/[id]:', error);
    return NextResponse.json({ error: 'Failed to update habit' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const ok = await deleteHabit(session.user.id!, id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Error in DELETE /quest/api/habits/[id]:', error);
    return NextResponse.json({ error: 'Failed to delete habit' }, { status: 500 });
  }
}
