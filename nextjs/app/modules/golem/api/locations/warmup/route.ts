import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { setActiveWarmupLocation } from '../../../lib/locationFunctions';

// Sets (locationId) or clears (locationId: null) the user's active warmup location.
export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const locationId: string | null =
      typeof body?.locationId === 'string' ? body.locationId : null;

    await setActiveWarmupLocation(session.user.id!, locationId);
    return NextResponse.json({ success: true, warmupLocationId: locationId });
  } catch (error: any) {
    if (error?.message?.includes('No location found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Error in POST /api/locations/warmup:', error);
    return NextResponse.json({ error: 'Failed to set warmup location' }, { status: 500 });
  }
}
