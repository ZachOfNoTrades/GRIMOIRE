import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listHabits, createHabit } from '../../lib/habitFunctions';
import { Difficulty, DIFFICULTY_ORDER } from '../../types/task';
import { parseRewardOverride, validateTitle } from '../../lib/valueLimits';

export async function GET(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const habits = await listHabits(session.user.id!);
    return NextResponse.json(habits);
  } catch (error) {
    console.error('Error in GET /quest/api/habits:', error);
    return NextResponse.json({ error: 'Failed to list habits' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const titleResult = validateTitle(body.title, 'Title');
    if ('error' in titleResult) {
      return NextResponse.json({ error: titleResult.error }, { status: 400 });
    }
    const title = titleResult.title;
    const difficulty = body.difficulty as Difficulty;
    const allowPositive = body.allow_positive !== false;
    const allowNegative = body.allow_negative !== false;
    if (!DIFFICULTY_ORDER.includes(difficulty)) {
      return NextResponse.json({ error: 'Invalid difficulty' }, { status: 400 });
    }
    if (!allowPositive && !allowNegative) {
      return NextResponse.json({ error: 'Habit must allow at least one direction' }, { status: 400 });
    }
    // Manual reward override: null/absent/empty/invalid -> no override; a finite >=0 number sets it;
    // one too large for the DECIMAL(10,2) column is a 400, not a driver-level 500.
    const rewardResult = parseRewardOverride(body.manual_reward_override);
    if ('error' in rewardResult) {
      return NextResponse.json({ error: rewardResult.error }, { status: 400 });
    }
    const manualReward = rewardResult.value;
    const habit = await createHabit(session.user.id!, {
      title,
      difficulty,
      allowPositive,
      allowNegative,
      manualRewardOverride: manualReward,
    });
    return NextResponse.json(habit, { status: 201 });
  } catch (error) {
    console.error('Error in POST /quest/api/habits:', error);
    return NextResponse.json({ error: 'Failed to create habit' }, { status: 500 });
  }
}
