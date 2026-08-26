import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getDayArchetypes, createDayArchetype } from '../../lib/dayArchetypeFunctions';
import { coerceDaySlotInput, DaySlotInputError } from '../../lib/daySlotInput';

// GET: list the user's day archetypes.
export async function GET(request: Request) {
  try {
    const authSession = await getAuthorizedUser(request);
    if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const archetypes = await getDayArchetypes(authSession.user.id!);
    return NextResponse.json({ archetypes });
  } catch (error) {
    console.error('Error in GET /api/day-archetypes:', error);
    return NextResponse.json({ error: 'Failed to fetch day archetypes' }, { status: 500 });
  }
}

// POST: create a day archetype. Body: { name, description?, program_id?, slots? }. When `slots` is
// provided, the archetype and its slots are created together (atomically); omit it for a bare archetype.
export async function POST(request: Request) {
  try {
    const authSession = await getAuthorizedUser(request);
    if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    if (!body?.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Coerce each incoming slot to a full DaySlotInput (defaults fill any missing fields).
    const slots = Array.isArray(body?.slots) ? body.slots.map(coerceDaySlotInput) : [];

    const id = await createDayArchetype(authSession.user.id!, {
      name: body.name.trim(),
      description: body.description ?? null,
      program_id: body.program_id ?? null,
      slots,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error: any) {
    // Caller error (bad UUID in a slot, or a reference to a row that doesn't exist) → 400, not a 500.
    if (error instanceof DaySlotInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error?.number === 547) return NextResponse.json({ error: 'a slot references an exercise or muscle group that does not exist' }, { status: 400 });
    console.error('Error in POST /api/day-archetypes:', error);
    return NextResponse.json({ error: 'Failed to create day archetype' }, { status: 500 });
  }
}
