import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listRecentFoodUsage } from '../../../lib/entryFunctions';
import { getFood } from '../../../lib/foodFunctions';

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const limit = Math.min(50, Number(request.nextUrl.searchParams.get('limit') || 12));
    const usage = await listRecentFoodUsage(session.user.id!, limit);
    if (usage.length === 0) return NextResponse.json([]);
    // Fetch each food in parallel; preserve recency order
    const foods = await Promise.all(
      usage.map((u) => getFood(session.user.id!, u.food_id).catch(() => null))
    );
    // Attach each food's last-logged serving + amount so the "Latest" rows default
    // to "last used" instead of "1 serving". Drop any food that failed to load.
    const enriched = foods.map((food, i) =>
      food ? { ...food, last_serving_id: usage[i].last_serving_id, last_quantity: usage[i].last_quantity } : null
    );
    return NextResponse.json(enriched.filter(Boolean));
  } catch (error) {
    console.error('Error in GET /forage/api/foods/recent:', error);
    return NextResponse.json({ error: 'Failed to list recent foods' }, { status: 500 });
  }
}
