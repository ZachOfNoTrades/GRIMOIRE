import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { estimateGenericFood } from '../../lib/genericFoodLLM';
import { createFood } from '../../lib/foodFunctions';
import { listNutrients } from '../../lib/nutrientFunctions';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Expected JSON body' }, { status: 400 });
  }

  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  if (!description) return NextResponse.json({ error: 'description is required' }, { status: 400 });
  if (description.length > 500) return NextResponse.json({ error: 'description too long (max 500 chars)' }, { status: 400 });

  try {
    const estimate = await estimateGenericFood(description);
    const allNutrients = await listNutrients();
    const codeToId = new Map(allNutrients.map(n => [n.code, n.id]));

    const nutrients = Object.entries(estimate.nutrients)
      .filter(([code, amt]) => amt > 0 && codeToId.has(code))
      .map(([code, amt]) => ({ nutrient_id: codeToId.get(code)!, amount: amt }));

    const food = await createFood(session.user.id!, {
      name: estimate.name,
      brand: null,
      source: 'generic',
      kcal_per_serving: estimate.kcal,
      protein_g_per_serving: estimate.protein_g,
      carbs_g_per_serving: estimate.carbs_g,
      fat_g_per_serving: estimate.fat_g,
      icon: null,
      barcode_upc: null,
      servings: [
        { unit: estimate.serving_unit, units_per_serving: 1 },
        { unit: 'g', units_per_serving: estimate.serving_grams },
      ],
      nutrients,
    });

    return NextResponse.json(food, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /forage/api/generic-food:', error);
    return NextResponse.json({ error: error?.message || 'Failed to create generic food' }, { status: 500 });
  }
}
