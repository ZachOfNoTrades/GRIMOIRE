import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { resolveUpload, saveUpload, MAX_VIDEO_UPLOAD_BYTES } from '../../lib/uploadFunctions';

// Stores an image or video pasted/picked into a rune card editor. Returns the
// URL the card's markdown should embed, served back by the
// [userId]/[filename] GET route.
export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id!;

    let formData;
    try {
      formData = await request.formData();
    } catch {
      // A body larger than the server's own request-body cap gets truncated
      // mid-multipart-boundary, which fails parsing here rather than hitting
      // the per-kind size check below — treat it the same way (report the
      // largest cap, since we can't tell the file's type once parsing failed).
      const maxMb = Math.round(MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024));
      return NextResponse.json({ error: `File too large (max ${maxMb}MB)` }, { status: 400 });
    }

    const file = formData.get('file');
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const resolved = resolveUpload(file.type);
    if (!resolved) {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    if (file.size > resolved.maxBytes) {
      const maxMb = Math.round(resolved.maxBytes / (1024 * 1024));
      return NextResponse.json({ error: `File too large (max ${maxMb}MB)` }, { status: 400 });
    }

    const url = await saveUpload(userId, Buffer.from(await file.arrayBuffer()), resolved.ext);
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Error in POST /modules/rune/api/uploads:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
