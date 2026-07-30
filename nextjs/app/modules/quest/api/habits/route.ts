import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listHabits, createHabit } from '../../lib/habitFunctions';
import { Difficulty, DIFFICULTY_ORDER } from '../../types/task';

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
    const habit = await createHabit(session.user.id!, { title, difficulty, allowPositive, allowNegative });
    return NextResponse.json(habit, { status: 201 });
  } catch (error) {
    console.error('Error in POST /quest/api/habits:', error);
    return NextResponse.json({ error: 'Failed to create habit' }, { status: 500 });
  }
}
