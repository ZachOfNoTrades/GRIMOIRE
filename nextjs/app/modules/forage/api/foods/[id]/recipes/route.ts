import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listRecipesUsingFood } from '../../../../lib/recipeFunctions';

// GET /modules/forage/api/foods/[id]/recipes
// "Where used" — the user's recipes that include this food as an ingredient.
// Multi-record result, so an empty list passes through without error (200 []).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const recipes = await listRecipesUsingFood(session.user.id!, id);
    return NextResponse.json(recipes);
  } catch (error) {
    console.error('Error in GET /forage/api/foods/[id]/recipes:', error);
    return NextResponse.json({ error: 'Failed to load recipes using this food' }, { status: 500 });
  }
}
