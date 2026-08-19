import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { parseLabelImage } from '../../lib/labelOcrFunctions';

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

  // Accept one OR MORE `image` fields. A single image is the classic nutrition-panel
  // scan; two (front + back of the package) let the vision LLM read the brand/name
  // off the front while still pulling nutrition off the panel. Cap at 2 so a stray
  // multi-select can't balloon the vision call — extra images past the first two are
  // ignored.
  const MAX_IMAGES = 2;
  const files = formData.getAll('image').filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: 'image (file) is required' }, { status: 400 });
  }

  try {
    const images = await Promise.all(
      files.slice(0, MAX_IMAGES).map(async (file) => ({
        imageBytes: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type || 'image/jpeg',
      }))
    );
    const draft = await parseLabelImage({ images, userId: session.user.id });
    return NextResponse.json(draft);
  } catch (error: any) {
    console.error('Error in POST /forage/api/label-ocr:', error);
    return NextResponse.json(
      { error: error?.message || 'Label OCR failed' },
      { status: 500 }
    );
  }
}
