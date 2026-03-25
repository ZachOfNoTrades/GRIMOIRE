import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/permissions';
import { getUserProfile, updateUserProfile } from '../../lib/userProfileFunctions';

export async function GET() {
  try {
    const session = await getAuthorizedSession();
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
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json();
    const { profile_prompt } = body;

    const profile = await updateUserProfile(userId!, profile_prompt?.trim() || null);
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
