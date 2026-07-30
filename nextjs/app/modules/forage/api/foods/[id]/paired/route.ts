import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listPairedFoodUsage } from '../../../../lib/entryFunctions';
import { getFood } from '../../../../lib/foodFunctions';

// GET /modules/forage/api/foods/[id]/paired — foods this user frequently logs on
// the same diary day as food [id] ("frequently paired with"). Returns hydrated
// Food objects (recency order preserved) with each partner's last-logged serving +
// amount attached, so the diary's pairing strip can re-add them at the usual size.
// Scoped to the caller's own entries, so an unknown/other-user food yields [].
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  try {
    const limit = Math.min(20, Number(request.nextUrl.searchParams.get('limit') || 10));
    const usage = await listPairedFoodUsage(session.user.id!, id, limit);
    if (usage.length === 0) return NextResponse.json([]);
    // Hydrate each partner food in parallel; preserve the co-occurrence order.
    const foods = await Promise.all(
      usage.map((u) => getFood(session.user.id!, u.food_id).catch(() => null))
    );
    // Attach last-logged serving + amount so the strip re-adds at the usual size
    // instead of "1 serving". Drop any food that failed to hydrate.
    const enriched = foods.map((food, i) =>
      food ? { ...food, last_serving_id: usage[i].last_serving_id, last_quantity: usage[i].last_quantity } : null
    );
    return NextResponse.json(enriched.filter(Boolean));
  } catch (error) {
    console.error('Error in GET /forage/api/foods/[id]/paired:', error);
    return NextResponse.json({ error: 'Failed to load paired foods' }, { status: 500 });
  }
}
