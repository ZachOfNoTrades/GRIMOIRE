import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getDayArchetypeWithSlots, updateDayArchetype, deleteDayArchetype } from '../../../lib/dayArchetypeFunctions';

// GET: one archetype with its ordered slots.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const authSession = await getAuthorizedUser(request);
    if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    const archetype = await getDayArchetypeWithSlots(authSession.user.id!, id);
    return NextResponse.json({ archetype });
  } catch (error: any) {
    if (error?.message?.includes('No day archetype found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Error in GET /api/day-archetypes/[id]:', error);
    return NextResponse.json({ error: 'Failed to fetch day archetype' }, { status: 500 });
  }
}

// PUT: update an archetype's name/description.
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const authSession = await getAuthorizedUser(request);
    if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    const description = body?.description ? String(body.description) : null;
    await updateDayArchetype(authSession.user.id!, id, { name, description });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in PUT /api/day-archetypes/[id]:', error);
    return NextResponse.json({ error: 'Failed to update day archetype' }, { status: 500 });
  }
}

// DELETE: remove an archetype (and its slots; clears the link from sessions).
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const authSession = await getAuthorizedUser(request);
    if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    await deleteDayArchetype(authSession.user.id!, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/day-archetypes/[id]:', error);
    return NextResponse.json({ error: 'Failed to delete day archetype' }, { status: 500 });
  }
}
