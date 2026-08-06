import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listFoods, createFood, getFood, normalizeSourceUrl, DuplicateBarcodeError } from '../../lib/foodFunctions';
import { saveFoodImageFromUrl } from '../../lib/foodImageFunctions';

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const search = request.nextUrl.searchParams.get('search');
    const barcode = request.nextUrl.searchParams.get('barcode');
    const foods = await listFoods(session.user.id!, search, barcode);
    return NextResponse.json(foods);
  } catch (error) {
    console.error('Error in GET /forage/api/foods:', error);
    return NextResponse.json({ error: 'Failed to list foods' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json();
    const name = (body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    const food = await createFood(session.user.id!, {
      name,
      brand: body.brand?.trim() || null,
      kcal_per_serving: Number(body.kcal_per_serving ?? 0),
      protein_g_per_serving: Number(body.protein_g_per_serving ?? 0),
      carbs_g_per_serving: Number(body.carbs_g_per_serving ?? 0),
      fat_g_per_serving: Number(body.fat_g_per_serving ?? 0),
      icon: typeof body.icon === 'string' && body.icon.trim() ? body.icon.trim() : null,
      barcode_upc: typeof body.barcode_upc === 'string' && body.barcode_upc.trim() ? body.barcode_upc.trim() : null,
      source_url: normalizeSourceUrl(body.source_url),
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
            // An explicit zero is DATA — "Trans fat 0 g" on a label, or a 0 in an
            // Open Food Facts record — and must persist. Only missing/negative
            // values are dropped.
            .filter((n: any) => n && typeof n.nutrient_id === 'string' && Number.isFinite(Number(n.amount)) && Number(n.amount) >= 0)
            .map((n: any) => ({ nutrient_id: n.nutrient_id, amount: Number(n.amount) }))
        : [],
      omit_default_serving: body.omit_default_serving === true,
      // Shared-library food (user_id NULL) rather than one of this user's own.
      is_global: body.is_global === true,
    });

    // PRODUCT PHOTO — downloaded server-side after the food exists, and only
    // from allowlisted hosts (see foodImageFunctions). Best-effort on purpose:
    // a photo that won't download must not fail the food, which is already
    // saved and perfectly usable with its icon.
    if (typeof body.image_source_url === 'string' && body.image_source_url.trim()) {
      const stored = await saveFoodImageFromUrl(food.id, body.image_source_url.trim());
      if (stored) return NextResponse.json(await getFood(session.user.id!, food.id), { status: 201 });
    }

    return NextResponse.json(food, { status: 201 });
  } catch (error) {
    // A barcode that's already in the library → 409 with the existing food so the
    // UI can point the user at it instead of creating a duplicate.
    if (error instanceof DuplicateBarcodeError) {
      return NextResponse.json(
        { error: error.message, code: 'DUPLICATE_BARCODE', existing: { id: error.existingId, name: error.existingName } },
        { status: 409 }
      );
    }
    console.error('Error in POST /forage/api/foods:', error);
    return NextResponse.json({ error: 'Failed to create food' }, { status: 500 });
  }
}
