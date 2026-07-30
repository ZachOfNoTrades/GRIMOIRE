import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listNutrients } from '../../lib/nutrientFunctions';

export async function GET(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const nutrients = await listNutrients();
    return NextResponse.json(nutrients);
  } catch (error) {
    console.error('Error in GET /forage/api/nutrients:', error);
    return NextResponse.json({ error: 'Failed to list nutrients' }, { status: 500 });
  }
}
