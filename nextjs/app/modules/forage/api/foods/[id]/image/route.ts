import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { getFoodImage } from '../../../../lib/foodImageFunctions';

export const runtime = 'nodejs';

// FOOD PHOTO — serves the bytes stored against a food. A food with no photo 404s
// and the UI renders its icon instead, so this is a normal, expected outcome
// rather than an error worth logging.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  try {
    const image = await getFoodImage(id);
    if (!image) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return new NextResponse(new Uint8Array(image.bytes), {
      headers: {
        'content-type': image.contentType,
        'content-length': String(image.bytes.byteLength),
        // The URL carries image_updated_at as a cache-buster, so a given URL
        // always names the same bytes and can be cached hard. Private: these
        // sit behind auth and shouldn't land in a shared cache.
        'cache-control': 'private, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error in GET /forage/api/foods/[id]/image:', error);
    return NextResponse.json({ error: 'Failed to load image' }, { status: 500 });
  }
}
