import { NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getEquipmentImage } from '../../../../lib/locationFunctions';

// Serves the raw PNG stored in equipment.image_data — kept out of the equipment list
// JSON response (see listEquipment) so that payload stays small.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthorizedUser(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { id } = await params;
    const image = await getEquipmentImage(id);
    if (!image) {
      return NextResponse.json({ error: 'No image for this equipment' }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(image), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Error in GET /api/equipment/[id]/image:', error);
    return NextResponse.json({ error: 'Failed to load equipment image' }, { status: 500 });
  }
}
