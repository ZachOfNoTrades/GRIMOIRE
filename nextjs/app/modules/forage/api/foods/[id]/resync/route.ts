import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getFood, updateFood } from '../../../../lib/foodFunctions';
import { extractFoodFromUrl } from '../../../../lib/foodUrlLLM';
import { listUnits } from '../../../../lib/unitFunctions';
import { listNutrients } from '../../../../lib/nutrientFunctions';

export const runtime = 'nodejs';
// Same ceiling as the import — this re-runs the identical scrape + LLM pass.
export const maxDuration = 300;

// RESYNC — re-read the food's stored source_url and refresh its nutrition from
// the page as it stands today (menu items get reformulated; brands restate
// panels). Deliberately narrow: macros, micronutrients and serving sizes are
// refreshed, while the food's IDENTITY (name, brand, icon, barcode, the source
// link itself) is left exactly as the user has it. Serving units are MERGED, not
// replaced, so units the user added by hand — and the log entries pointing at
// them — survive a resync.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const food = await getFood(session.user.id!, id);
    if (!food.source_url) {
      return NextResponse.json({ error: 'This food has no source link to resync from' }, { status: 400 });
    }
    // Someone ELSE's private food is off limits. Shared/global foods (user_id
    // NULL) are fair game — updateFood already allows editing them, and a food
    // imported straight into the global library would otherwise be permanently
    // un-resyncable by the very person who added it.
    if (food.user_id !== null && food.user_id !== session.user.id) {
      return NextResponse.json({ error: "This food isn't yours to edit" }, { status: 403 });
    }

    const units = await listUnits(session.user.id!);
    const knownUnits = new Set(units.map((u) => u.name.toLowerCase()));
    const draft = await extractFoodFromUrl({ url: food.source_url, knownUnits });

    // No facts panel on the page today → change nothing and say so, rather than
    // zeroing out a food that was fine.
    if (!draft.serving_size_stated || draft.kcal_per_serving === null) {
      return NextResponse.json(
        { error: "Couldn't find nutrition information at that link — the food was left unchanged." },
        { status: 400 }
      );
    }

    // MERGE SERVINGS — existing rows win on unit name (their ids are referenced by
    // food_entries); scraped rows only ADD units the food doesn't have yet.
    const existingUnits = new Set(food.servings.map((s) => s.unit.toLowerCase()));
    const mergedServings = [
      ...food.servings.map((s) => ({ unit: s.unit, units_per_serving: s.units_per_serving })),
      ...draft.servings
        .filter((s) => s.units_per_serving > 0 && !existingUnits.has(s.unit.toLowerCase()))
        .map((s) => ({ unit: s.unit, units_per_serving: s.units_per_serving })),
    ];

    // NUTRIENTS — the scrape is authoritative for what the page states; a nutrient
    // the page doesn't mention keeps whatever the food already had, so a sparse
    // page can't silently wipe a fuller record.
    const nutrients = await listNutrients();
    const idByCode = new Map(nutrients.map((n) => [n.code, n.id]));
    const merged = new Map<string, number>((food.nutrients ?? []).map((n) => [n.nutrient_id, n.amount]));
    for (const [code, amount] of Object.entries(draft.nutrients_by_code)) {
      const nutrientId = idByCode.get(code);
      if (nutrientId) merged.set(nutrientId, amount);
    }

    const updated = await updateFood(session.user.id!, id, {
      // IDENTITY — carried over untouched.
      name: food.name,
      brand: food.brand,
      icon: food.icon,
      barcode_upc: food.barcode_upc,
      source_url: food.source_url,
      // NUTRITION — from the page. A macro the page omitted keeps its old value.
      kcal_per_serving: draft.kcal_per_serving,
      protein_g_per_serving: draft.protein_g_per_serving ?? food.protein_g_per_serving,
      carbs_g_per_serving: draft.carbs_g_per_serving ?? food.carbs_g_per_serving,
      fat_g_per_serving: draft.fat_g_per_serving ?? food.fat_g_per_serving,
      servings: mergedServings,
      nutrients: Array.from(merged, ([nutrient_id, amount]) => ({ nutrient_id, amount })),
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error?.message?.startsWith('No food found')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('Error in POST /forage/api/foods/[id]/resync:', error);
    // extractFoodFromUrl throws user-safe messages (blocked, timeout, unreadable).
    return NextResponse.json({ error: error?.message ?? 'Resync failed' }, { status: 400 });
  }
}
