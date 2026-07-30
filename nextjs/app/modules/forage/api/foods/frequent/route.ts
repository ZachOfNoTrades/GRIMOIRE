import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listHourlyFrequentFoodUsage } from '../../../lib/entryFunctions';
import { getFood } from '../../../lib/foodFunctions';
import { getSettings } from '../../../lib/settingsFunctions';

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const limit = Math.min(20, Number(request.nextUrl.searchParams.get('limit') || 8));
    // Hour is the caller's local clock hour (entry_time is stored in local wall-clock,
    // see _diary defaultTime). Fall back to the server's hour if absent/invalid.
    const hourParam = Number(request.nextUrl.searchParams.get('hour'));
    const hour = Number.isInteger(hourParam) && hourParam >= 0 && hourParam <= 23 ? hourParam : new Date().getHours();
    // History window is the user's configurable favorites setting (days, default 30).
    const settings = await getSettings(session.user.id!);
    const usage = await listHourlyFrequentFoodUsage(session.user.id!, hour, limit, settings.favorites_history_days);
    if (usage.length === 0) return NextResponse.json([]);
    // Fetch each food in parallel; preserve frequency order
    const foods = await Promise.all(
      usage.map((u) => getFood(session.user.id!, u.food_id).catch(() => null))
    );
    // Attach each food's last-logged serving + amount so the "Frequent now" rows
    // default to "last used" instead of "1 serving". Drop any food that failed to load.
    const enriched = foods.map((food, i) =>
      food ? { ...food, last_serving_id: usage[i].last_serving_id, last_quantity: usage[i].last_quantity } : null
    );
    return NextResponse.json(enriched.filter(Boolean));
  } catch (error) {
    console.error('Error in GET /forage/api/foods/frequent:', error);
    return NextResponse.json({ error: 'Failed to list frequent foods' }, { status: 500 });
  }
}
