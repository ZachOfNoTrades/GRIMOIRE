import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { listEquipment, listEquipmentOptions } from '../../lib/locationFunctions';

export async function GET(request: Request) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const [equipment, options] = await Promise.all([
      listEquipment(),
      listEquipmentOptions(),
    ]);
    return NextResponse.json({ equipment, options });
  } catch (error) {
    console.error('Error in GET /api/equipment:', error);
    return NextResponse.json({ error: 'Failed to load equipment' }, { status: 500 });
  }
}
