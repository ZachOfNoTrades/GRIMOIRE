import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listMetrics } from '@/lib/health/metrics';

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await listMetrics());
  } catch (error) {
    console.error('Error in GET /api/health/metrics:', error);
    return NextResponse.json({ error: 'Failed to list health metrics' }, { status: 500 });
  }
}
