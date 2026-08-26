import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { createDaySlot } from '../../../../lib/dayArchetypeFunctions';
import { coerceDaySlotInput, DaySlotInputError } from '../../../../lib/daySlotInput';

// POST: add a slot to an archetype.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const authSession = await getAuthorizedUser(request);
    if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    const input = coerceDaySlotInput(await request.json());
    const slotId = await createDaySlot(authSession.user.id!, id, input);
    return NextResponse.json({ id: slotId }, { status: 201 });
  } catch (error: any) {
    // Caller error (bad UUID, or a reference to a row that doesn't exist) → 400, not a 500.
    if (error instanceof DaySlotInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error?.number === 547) return NextResponse.json({ error: 'pinned_exercise_id or target_muscle_group_id does not exist' }, { status: 400 });
    console.error('Error in POST /api/day-archetypes/[id]/slots:', error);
    return NextResponse.json({ error: 'Failed to create day slot' }, { status: 500 });
  }
}
