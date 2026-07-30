import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listFavoriteFoods } from '../../../lib/foodFunctions';

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const foods = await listFavoriteFoods(session.user.id!);
    return NextResponse.json(foods);
  } catch (error) {
    console.error('Error in GET /forage/api/foods/favorites:', error);
    return NextResponse.json({ error: 'Failed to load favorites' }, { status: 500 });
  }
}
