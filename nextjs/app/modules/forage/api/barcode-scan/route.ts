import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { parseBarcodeImage } from '../../lib/barcodeScanFunctions';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const session = await getAuthorizedUser(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data with an image field' }, { status: 400 });
  }

  const image = formData.get('image');
  if (!(image instanceof File)) {
    return NextResponse.json({ error: 'image (file) is required' }, { status: 400 });
  }

  try {
    const imageBytes = Buffer.from(await image.arrayBuffer());
    const draft = await parseBarcodeImage({
      imageBytes,
      mimeType: image.type || 'image/jpeg',
    });
    return NextResponse.json(draft);
  } catch (error: any) {
    console.error('Error in POST /forage/api/barcode-scan:', error);
    return NextResponse.json(
      { error: error?.message || 'Barcode scan failed' },
      { status: 500 }
    );
  }
}
