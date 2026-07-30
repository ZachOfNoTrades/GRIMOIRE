import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getFood, updateFood, archiveFood, setFoodFavorite } from '../../../lib/foodFunctions';
import { getRecipeIngredients } from '../../../lib/recipeFunctions';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const food = await getFood(session.user.id!, id);
    // Recipe-source foods carry an ingredient list that the plain foods payload
    // doesn't. Ship it alongside the food so the detail view renders ingredients
    // in the same pass as the macros/nutrients — no second round trip, no pop-in.
    if (food.source === 'recipe') {
      const ingredients = await getRecipeIngredients(session.user.id!, id);
      return NextResponse.json({ ...food, ingredients });
    }
    return NextResponse.json(food);
  } catch (error: any) {
    if (error?.message?.startsWith('No food found')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('Error in GET /forage/api/foods/[id]:', error);
    return NextResponse.json({ error: 'Failed to load food' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json();
    const name = (body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    const food = await updateFood(session.user.id!, id, {
      name,
      brand: body.brand?.trim() || null,
      kcal_per_serving: Number(body.kcal_per_serving ?? 0),
      protein_g_per_serving: Number(body.protein_g_per_serving ?? 0),
      carbs_g_per_serving: Number(body.carbs_g_per_serving ?? 0),
      fat_g_per_serving: Number(body.fat_g_per_serving ?? 0),
      icon: typeof body.icon === 'string' && body.icon.trim() ? body.icon.trim() : null,
      barcode_upc: typeof body.barcode_upc === 'string' && body.barcode_upc.trim() ? body.barcode_upc.trim() : null,
      servings: Array.isArray(body.servings)
        ? body.servings
            .filter((s: any) => s && typeof s.unit === 'string' && s.unit.trim() && Number(s.units_per_serving) > 0)
            .map((s: any) => ({
              unit: s.unit.trim(),
              units_per_serving: Number(s.units_per_serving),
            }))
        : [],
      nutrients: Array.isArray(body.nutrients)
        ? body.nutrients
            .filter((n: any) => n && typeof n.nutrient_id === 'string' && Number(n.amount) > 0)
            .map((n: any) => ({ nutrient_id: n.nutrient_id, amount: Number(n.amount) }))
        : [],
    });
    return NextResponse.json(food);
  } catch (error) {
    console.error('Error in PUT /forage/api/foods/[id]:', error);
    return NextResponse.json({ error: 'Failed to update food' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json();
    if (typeof body.is_favorite !== 'boolean') {
      return NextResponse.json({ error: 'is_favorite (boolean) required' }, { status: 400 });
    }
    await setFoodFavorite(session.user.id!, id, body.is_favorite);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in PATCH /forage/api/foods/[id]:', error);
    return NextResponse.json({ error: 'Failed to update food' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    await archiveFood(session.user.id!, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error in DELETE /forage/api/foods/[id]:', error);
    return NextResponse.json({ error: 'Failed to delete food' }, { status: 500 });
  }
}
