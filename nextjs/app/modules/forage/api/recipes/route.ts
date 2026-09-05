import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listRecipes, createRecipe, parseRecipeInput, RecipeSort } from '../../lib/recipeFunctions';

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const search = request.nextUrl.searchParams.get('search');
    // Recipes tab sort: last used / created / A–Z. Unknown values fall back to
    // the default (last_used) rather than erroring.
    const sortParam = request.nextUrl.searchParams.get('sort');
    const sort: RecipeSort =
      sortParam === 'created' || sortParam === 'name' || sortParam === 'last_used'
        ? sortParam
        : 'last_used';
    const recipes = await listRecipes(session.user.id!, search, sort);
    return NextResponse.json(recipes);
  } catch (error) {
    console.error('Error in GET /forage/api/recipes:', error);
    return NextResponse.json({ error: 'Failed to list recipes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    const parsed = parseRecipeInput(body);
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const recipe = await createRecipe(session.user.id!, parsed.input);
    return NextResponse.json(recipe, { status: 201 });
  } catch (error) {
    console.error('Error in POST /forage/api/recipes:', error);
    return NextResponse.json({ error: 'Failed to create recipe' }, { status: 500 });
  }
}
