import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getPreSurvey, upsertPreSurvey } from '../../../../lib/preSurveyFunctions';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authSession = await getAuthorizedUser(request);
    if (!authSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = authSession.user.id;

    const { id } = await context.params;
    const preSurvey = await getPreSurvey(userId!, id);
    return NextResponse.json(preSurvey);

  } catch (error) {
    if (error instanceof Error && error.message.includes('No workout session found')) {
      return NextResponse.json({ error: 'Workout session not found' }, { status: 404 });
    }
    console.error('Error in GET /api/sessions/[id]/pre-survey:', error);
    return NextResponse.json({ error: 'Failed to fetch pre-survey' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authSession = await getAuthorizedUser(request);
    if (!authSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = authSession.user.id;

    const { id } = await context.params;
    const body = await request.json();

    // Basic shape validation
    const notes = typeof body.notes === 'string' ? body.notes : null;
    const muscles = Array.isArray(body.muscles)
      ? body.muscles.filter((m: any) =>
          m && typeof m.muscle_group_id === 'string'
            && typeof m.fatigue === 'number'
            && Number.isFinite(m.fatigue)
            && m.fatigue >= 1 && m.fatigue <= 3
        ).map((m: any) => ({ muscle_group_id: m.muscle_group_id, fatigue: Math.round(m.fatigue) }))
      : [];

    const updated = await upsertPreSurvey(userId!, id, { notes, muscles });
    return NextResponse.json(updated);

  } catch (error) {
    if (error instanceof Error && error.message.includes('No workout session found')) {
      return NextResponse.json({ error: 'Workout session not found' }, { status: 404 });
    }
    console.error('Error in PUT /api/sessions/[id]/pre-survey:', error);
    return NextResponse.json({ error: 'Failed to save pre-survey' }, { status: 500 });
  }
}
