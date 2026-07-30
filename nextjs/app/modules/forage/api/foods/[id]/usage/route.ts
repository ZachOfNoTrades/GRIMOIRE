import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getFoodUsage } from '../../../../lib/foodFunctions';

// GET /modules/forage/api/foods/[id]/usage — logging-frequency stats for one food
// (all-time totals + trailing weekly series). Scoped to the caller's own entries,
// so requesting another user's food simply yields zeros rather than leaking data.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const usage = await getFoodUsage(session.user.id!, id);
    return NextResponse.json(usage);
  } catch (error: any) {
    console.error('Error in GET /forage/api/foods/[id]/usage:', error);
    return NextResponse.json({ error: 'Failed to load usage' }, { status: 500 });
  }
}
