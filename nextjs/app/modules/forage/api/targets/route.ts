import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getActiveTarget, setTarget } from '../../lib/targetFunctions';

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const date = request.nextUrl.searchParams.get('date');
    const target = await getActiveTarget(session.user.id!, date);
    return NextResponse.json(target);
  } catch (error) {
    console.error('Error in GET /forage/api/targets:', error);
    return NextResponse.json({ error: 'Failed to load target' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const kcal = Number(body.kcal);
    const protein_g = Number(body.protein_g);
    const carbs_g = Number(body.carbs_g);
    const fat_g = Number(body.fat_g);
    if (![kcal, protein_g, carbs_g, fat_g].every((n) => Number.isFinite(n) && n >= 0)) {
      return NextResponse.json({ error: 'kcal/protein_g/carbs_g/fat_g must be non-negative numbers' }, { status: 400 });
    }
    const target = await setTarget(session.user.id!, { kcal, protein_g, carbs_g, fat_g });
    return NextResponse.json(target, { status: 201 });
  } catch (error) {
    console.error('Error in POST /forage/api/targets:', error);
    return NextResponse.json({ error: 'Failed to save target' }, { status: 500 });
  }
}
