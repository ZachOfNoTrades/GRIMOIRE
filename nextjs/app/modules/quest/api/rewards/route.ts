import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listRewards, createReward } from '../../lib/rewardFunctions';

export async function GET(request: Request) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const rewards = await listRewards(session.user.id!);
    return NextResponse.json(rewards);
  } catch (error) {
    console.error('Error in GET /quest/api/rewards:', error);
    return NextResponse.json({ error: 'Failed to list rewards' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const name = (body.name ?? '').trim();
    const cost = Number(body.cost);
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!Number.isInteger(cost) || cost <= 0) {
      return NextResponse.json({ error: 'Cost must be a positive integer' }, { status: 400 });
    }
    const reward = await createReward(session.user.id!, name, cost);
    return NextResponse.json(reward, { status: 201 });
  } catch (error) {
    console.error('Error in POST /quest/api/rewards:', error);
    return NextResponse.json({ error: 'Failed to create reward' }, { status: 500 });
  }
}
