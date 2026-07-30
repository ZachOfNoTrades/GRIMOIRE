import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { setDefaultLocation } from '../../../../lib/locationFunctions';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    await setDefaultLocation(session.user.id!, id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message?.includes('No location found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Error in POST /api/locations/[id]/default:', error);
    return NextResponse.json({ error: 'Failed to set default location' }, { status: 500 });
  }
}
