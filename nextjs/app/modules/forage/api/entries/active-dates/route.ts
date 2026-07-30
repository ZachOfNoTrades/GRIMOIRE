import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listActiveDates } from '../../../lib/entryFunctions';

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const since = request.nextUrl.searchParams.get('since');
    if (!since) return NextResponse.json({ error: 'since param required' }, { status: 400 });
    const dates = await listActiveDates(session.user.id!, since);
    return NextResponse.json(dates);
  } catch (error) {
    console.error('Error in GET /forage/api/entries/active-dates:', error);
    return NextResponse.json({ error: 'Failed to list active dates' }, { status: 500 });
  }
}
