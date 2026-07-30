import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getUserProfile, updateUserProfile } from '../../lib/userProfileFunctions';

export async function GET(request: Request) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const profile = await getUserProfile(userId!);
    return NextResponse.json(profile);

  } catch (error: any) {
    if (error?.message?.includes('No user profile found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error('Error in GET /api/user-profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user profile' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json();

    // Partial update: only forward the fields the client actually sent so a units-only save doesn't
    // clobber the profile prompt (and vice-versa).
    const updates: {
      profilePrompt?: string | null;
      distanceUnitShort?: string | null;
      distanceUnitLong?: string | null;
      restTimerEnabled?: boolean;
    } = {};
    if ('profile_prompt' in body) updates.profilePrompt = body.profile_prompt?.trim() || null;
    if ('distance_unit_short' in body) updates.distanceUnitShort = body.distance_unit_short || null;
    if ('distance_unit_long' in body) updates.distanceUnitLong = body.distance_unit_long || null;
    // Coerce to a real boolean rather than `|| null` — `false` is a meaningful value here, not "absent".
    if ('rest_timer_enabled' in body) updates.restTimerEnabled = body.rest_timer_enabled === true;

    const profile = await updateUserProfile(userId!, updates);
    return NextResponse.json(profile);

  } catch (error: any) {
    if (error?.message?.includes('No user profile found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error('Error in PUT /api/user-profile:', error);
    return NextResponse.json(
      { error: 'Failed to update user profile' },
      { status: 500 }
    );
  }
}
