import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listFoodsHighInNutrient } from '../../lib/foodFunctions';

// GET /modules/forage/api/foods-by-nutrient?nutrient_id=<uuid>&limit=<n>
// Foods richest in the given nutrient (user's + shared library), for the nutrient
// detail page. The detail page already holds the nutrient's id, so this takes the
// id directly rather than resolving by code.
export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const nutrientId = request.nextUrl.searchParams.get('nutrient_id');
    if (!nutrientId) return NextResponse.json({ error: 'nutrient_id is required' }, { status: 400 });

    // Clamp the limit to a sane window (default 10, hard cap 25).
    const rawLimit = Number(request.nextUrl.searchParams.get('limit'));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 25) : 10;

    // Optional log-date window (YYYY-MM-DD); absent → all-time.
    const startDate = request.nextUrl.searchParams.get('startDate') || undefined;
    const endDate = request.nextUrl.searchParams.get('endDate') || undefined;

    const foods = await listFoodsHighInNutrient(session.user.id!, nutrientId, limit, { startDate, endDate });
    return NextResponse.json(foods);
  } catch (error) {
    console.error('Error in GET /forage/api/foods-by-nutrient:', error);
    return NextResponse.json({ error: 'Failed to list foods by nutrient' }, { status: 500 });
  }
}
