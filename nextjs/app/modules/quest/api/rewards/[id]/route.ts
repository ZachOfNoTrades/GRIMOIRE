import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { deleteReward } from '../../../lib/rewardFunctions';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await context.params;
    const ok = await deleteReward(session.user.id!, id);
    if (!ok) return NextResponse.json({ error: 'Reward not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /quest/api/rewards/[id]:', error);
    return NextResponse.json({ error: 'Failed to delete reward' }, { status: 500 });
  }
}
