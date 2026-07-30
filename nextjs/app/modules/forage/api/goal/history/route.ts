import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listGoals } from '../../../lib/goalFunctions';

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const goals = await listGoals(session.user.id!);
    return NextResponse.json(goals);
  } catch (error) {
    console.error('Error in GET /forage/api/goal/history:', error);
    return NextResponse.json({ error: 'Failed to load goal history' }, { status: 500 });
  }
}
