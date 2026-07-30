import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { tapHabit } from '../../../../lib/habitFunctions';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const direction = body.direction;
    if (direction !== 'positive' && direction !== 'negative') {
      return NextResponse.json({ error: 'direction must be positive or negative' }, { status: 400 });
    }
    const result = await tapHabit(session.user.id!, id, direction);
    if (!result) return NextResponse.json({ error: 'Not found or direction not allowed' }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in POST /quest/api/habits/[id]/tap:', error);
    return NextResponse.json({ error: 'Failed to tap habit' }, { status: 500 });
  }
}
