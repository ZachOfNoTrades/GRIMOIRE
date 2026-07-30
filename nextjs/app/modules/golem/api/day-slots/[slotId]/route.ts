import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { updateDaySlot, deleteDaySlot } from '../../../lib/dayArchetypeFunctions';
import { coerceDaySlotInput } from '../../../lib/daySlotInput';

// PUT: update a slot.
export async function PUT(request: Request, context: { params: Promise<{ slotId: string }> }) {
  try {
    const authSession = await getAuthorizedUser(request);
    if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { slotId } = await context.params;
    const input = coerceDaySlotInput(await request.json());
    await updateDaySlot(authSession.user.id!, slotId, input);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in PUT /api/day-slots/[slotId]:', error);
    return NextResponse.json({ error: 'Failed to update day slot' }, { status: 500 });
  }
}

// DELETE: remove a slot.
export async function DELETE(request: Request, context: { params: Promise<{ slotId: string }> }) {
  try {
    const authSession = await getAuthorizedUser(request);
    if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { slotId } = await context.params;
    await deleteDaySlot(authSession.user.id!, slotId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/day-slots/[slotId]:', error);
    return NextResponse.json({ error: 'Failed to delete day slot' }, { status: 500 });
  }
}
