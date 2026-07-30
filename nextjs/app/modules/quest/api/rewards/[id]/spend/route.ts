import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { spendOnReward } from '../../../../lib/rewardFunctions';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    const result = await spendOnReward(session.user.id!, id);
    if (!result.ok && result.reason === 'not_found') {
      return NextResponse.json({ error: 'Reward not found' }, { status: 404 });
    }
    if (!result.ok && result.reason === 'insufficient') {
      return NextResponse.json({ error: 'Insufficient balance', balance: result.balance }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in POST /quest/api/rewards/[id]/spend:', error);
    return NextResponse.json({ error: 'Failed to spend on reward' }, { status: 500 });
  }
}
