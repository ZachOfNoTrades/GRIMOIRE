import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { updateUserUnit, deleteUserUnit, UnitValidationError } from '../../../lib/unitFunctions';

// Rename / re-group one of the caller's custom units. Body: { name, type? }.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    const unit = await updateUserUnit(session.user.id!, id, body?.name, body?.type ?? 'count');
    if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    return NextResponse.json(unit);
  } catch (error: any) {
    if (error instanceof UnitValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error in PUT /forage/api/units/[id]:', error);
    return NextResponse.json({ error: 'Failed to update unit' }, { status: 500 });
  }
}

// Delete one of the caller's custom units. Serving rows already labeled with it keep
// their text — the dropdowns show an unknown stored unit as a stale option.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const removed = await deleteUserUnit(session.user.id!, id);
    if (!removed) return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /forage/api/units/[id]:', error);
    return NextResponse.json({ error: 'Failed to delete unit' }, { status: 500 });
  }
}
