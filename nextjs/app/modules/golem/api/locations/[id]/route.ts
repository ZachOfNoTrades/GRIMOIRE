import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import {
  deleteLocation,
  getLocationWithEquipment,
  renameLocation,
  setBodyweightOnly,
  setLocationEquipment,
} from '../../../lib/locationFunctions';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const location = await getLocationWithEquipment(session.user.id!, id);
    return NextResponse.json(location);
  } catch (error: any) {
    if (error?.message?.includes('No location found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Error in GET /api/locations/[id]:', error);
    return NextResponse.json({ error: 'Failed to fetch location' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const body = await request.json();
    const userId = session.user.id!;

    if (typeof body?.name === 'string') {
      const trimmed = body.name.trim();
      if (!trimmed) {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      }
      await renameLocation(userId, id, trimmed);
    }

    if (typeof body?.bodyweight_only === 'boolean') {
      await setBodyweightOnly(userId, id, body.bodyweight_only);
    }

    if (Array.isArray(body?.selections)) {
      // Validate shape
      for (const s of body.selections) {
        if (!s || typeof s.equipment_id !== 'string' || !Array.isArray(s.option_ids)) {
          return NextResponse.json({ error: 'invalid selections payload' }, { status: 400 });
        }
      }
      await setLocationEquipment(userId, id, body.selections);
    }

    const location = await getLocationWithEquipment(userId, id);
    return NextResponse.json(location);
  } catch (error: any) {
    if (error?.message?.includes('No location found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error?.number === 2627 || error?.number === 2601) {
      return NextResponse.json({ error: 'A location with that name already exists' }, { status: 409 });
    }
    console.error('Error in PUT /api/locations/[id]:', error);
    return NextResponse.json({ error: 'Failed to update location' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    await deleteLocation(session.user.id!, id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message?.includes('No location found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error?.message?.includes('Cannot delete the default location')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error in DELETE /api/locations/[id]:', error);
    return NextResponse.json({ error: 'Failed to delete location' }, { status: 500 });
  }
}
