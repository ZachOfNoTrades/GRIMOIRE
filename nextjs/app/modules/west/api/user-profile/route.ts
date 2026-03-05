import { NextRequest, NextResponse } from 'next/server';
import { getUserProfile, updateUserProfile } from '../../lib/userProfileFunctions';

export async function GET() {
  try {

    const profile = await getUserProfile();
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

    const body = await request.json();
    const { profile_prompt } = body;

    const profile = await updateUserProfile(profile_prompt?.trim() || null);
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
