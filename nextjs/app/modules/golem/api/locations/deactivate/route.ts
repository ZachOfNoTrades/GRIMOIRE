import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { setActiveLocation } from '../../../lib/locationFunctions';

export async function POST(request: Request) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await setActiveLocation(session.user.id!, null);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/locations/deactivate:', error);
    return NextResponse.json({ error: 'Failed to deactivate location' }, { status: 500 });
  }
}
