import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { setSessionDayArchetype } from '../../../../lib/dayArchetypeFunctions';

// PUT: assign (or clear, with null) a session's day archetype. Body: { day_archetype_id: string | null }.
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const authSession = await getAuthorizedUser(request);
    if (!authSession) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await context.params;
    const body = await request.json();
    await setSessionDayArchetype(authSession.user.id!, id, body?.day_archetype_id ?? null);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in PUT /api/sessions/[id]/day-archetype:', error);
    return NextResponse.json({ error: 'Failed to assign day archetype' }, { status: 500 });
  }
}
