import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listUnits } from '../../lib/unitFunctions';

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const units = await listUnits();
    return NextResponse.json(units);
  } catch (error) {
    console.error('Error in GET /forage/api/units:', error);
    return NextResponse.json({ error: 'Failed to list units' }, { status: 500 });
  }
}
