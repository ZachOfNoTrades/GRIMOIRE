import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { lookupGenericFoodFromFdc } from '../../lib/usdaFdc';
import { createFood } from '../../lib/foodFunctions';
import { listNutrients } from '../../lib/nutrientFunctions';

export const runtime = 'nodejs';

// Look up a food name in USDA FoodData Central and persist it as a reusable
// `source: 'usda'` library food. Mirrors /generic-food but uses authoritative FDC
// nutrition (via lookupGenericFoodFromFdc) instead of an LLM estimate. Returns 404
// when FDC has no confident match (or no USDA_FDC_API_KEY is configured) so the UI
// can fall back to the AI estimate.
export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Expected JSON body' }, { status: 400 });
  }

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (name.length > 200) return NextResponse.json({ error: 'name too long (max 200 chars)' }, { status: 400 });

  try {
    const estimate = await lookupGenericFoodFromFdc(name);
    if (!estimate) {
      return NextResponse.json({ error: `No USDA match for '${name}'` }, { status: 404 });
    }

    const allNutrients = await listNutrients();
    const codeToId = new Map(allNutrients.map(n => [n.code, n.id]));
    const nutrients = Object.entries(estimate.nutrients)
      .filter(([code, amt]) => amt > 0 && codeToId.has(code))
      .map(([code, amt]) => ({ nutrient_id: codeToId.get(code)!, amount: amt }));

    // Base servings: the canonical unit (1) + grams, plus any FDC household
    // portions (cup/tbsp/…) as serving-preserving rows. units_per_serving = how many
    // of <unit> equal one serving, i.e. serving_grams / grams-per-unit.
    const seen = new Set([estimate.serving_unit.toLowerCase(), 'g']);
    const portionServings = (estimate.portions ?? [])
      .filter(p => p.grams > 0 && !seen.has(p.unit.toLowerCase()))
      .map(p => {
        seen.add(p.unit.toLowerCase());
        return { unit: p.unit, units_per_serving: Math.round((estimate.serving_grams / p.grams) * 1e4) / 1e4 };
      });

    const food = await createFood(session.user.id!, {
      name: estimate.name,
      brand: null,
      source: 'usda',
      usda_fdc_id: estimate.usda_fdc_id,
      kcal_per_serving: estimate.kcal,
      protein_g_per_serving: estimate.protein_g,
      carbs_g_per_serving: estimate.carbs_g,
      fat_g_per_serving: estimate.fat_g,
      icon: null,
      barcode_upc: null,
      servings: [
        { unit: estimate.serving_unit, units_per_serving: 1 },
        { unit: 'g', units_per_serving: estimate.serving_grams },
        ...portionServings,
      ],
      nutrients,
    });

    return NextResponse.json(food, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST /forage/api/usda-food:', error);
    return NextResponse.json({ error: error?.message || 'USDA lookup failed' }, { status: 500 });
  }
}
