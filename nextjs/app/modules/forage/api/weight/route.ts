import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listWeights, upsertWeight } from '../../lib/weightFunctions';

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const since = request.nextUrl.searchParams.get('since');
    const weights = await listWeights(session.user.id!, since);
    return NextResponse.json(weights);
  } catch (error) {
    console.error('Error in GET /forage/api/weight:', error);
    return NextResponse.json({ error: 'Failed to list weights' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const log_date = body.log_date as string;
    const weight_lb = Number(body.weight_lb);
    if (!log_date) return NextResponse.json({ error: 'log_date required' }, { status: 400 });
    if (!Number.isFinite(weight_lb) || weight_lb <= 0)
      return NextResponse.json({ error: 'weight_lb > 0 required' }, { status: 400 });
    let body_fat_pct: number | null = null;
    if (body.body_fat_pct != null && body.body_fat_pct !== '') {
      const bf = Number(body.body_fat_pct);
      if (!Number.isFinite(bf) || bf < 0 || bf > 80) {
        return NextResponse.json({ error: 'body_fat_pct must be 0..80' }, { status: 400 });
      }
      body_fat_pct = bf;
    }
    const entry = await upsertWeight(session.user.id!, log_date, weight_lb, body_fat_pct);
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('Error in POST /forage/api/weight:', error);
    return NextResponse.json({ error: 'Failed to log weight' }, { status: 500 });
  }
}
