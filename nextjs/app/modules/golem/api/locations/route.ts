import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { createLocation, listLocations } from '../../lib/locationFunctions';

export async function GET(request: Request) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const locations = await listLocations(session.user.id!);
    return NextResponse.json(locations);
  } catch (error) {
    console.error('Error in GET /api/locations:', error);
    return NextResponse.json({ error: 'Failed to list locations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const name: string | undefined = body?.name?.trim();
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    const location = await createLocation(session.user.id!, name);
    return NextResponse.json(location, { status: 201 });
  } catch (error: any) {
    // Unique constraint on (user_id, name)
    if (error?.message?.toLowerCase?.().includes('uq_locations_user_name') ||
        error?.number === 2627 || error?.number === 2601) {
      return NextResponse.json({ error: 'A location with that name already exists' }, { status: 409 });
    }
    console.error('Error in POST /api/locations:', error);
    return NextResponse.json({ error: 'Failed to create location' }, { status: 500 });
  }
}
