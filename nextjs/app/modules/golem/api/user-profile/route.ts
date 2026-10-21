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

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }

    // Refuse a non-boolean toggle to avoid saving nonsense such as "abc" as false
    for (const key of ['rest_timer_enabled', 'pre_workout_enabled']) {
      if (key in body && typeof body[key] !== 'boolean') {
        return NextResponse.json({ error: `${key} must be true or false` }, { status: 400 });
      }
    }

    // Partial update: only forward the fields the client actually sent so a units-only save doesn't
    // clobber the profile prompt (and vice-versa).
    const updates: {
      profilePrompt?: string | null;
      distanceUnitShort?: string | null;
      distanceUnitLong?: string | null;
      restTimerEnabled?: boolean;
      preWorkoutEnabled?: boolean;
    } = {};
    if ('profile_prompt' in body) updates.profilePrompt = body.profile_prompt?.trim() || null;
    if ('distance_unit_short' in body) updates.distanceUnitShort = body.distance_unit_short || null;
    if ('distance_unit_long' in body) updates.distanceUnitLong = body.distance_unit_long || null;
    if ('rest_timer_enabled' in body) updates.restTimerEnabled = body.rest_timer_enabled;
    if ('pre_workout_enabled' in body) updates.preWorkoutEnabled = body.pre_workout_enabled;

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
