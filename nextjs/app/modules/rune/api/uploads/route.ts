import { randomUUID } from 'crypto';
import { mkdir, writeFile, stat } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { UPLOAD_ROOT, resolveUpload, MAX_VIDEO_UPLOAD_BYTES } from '../../lib/uploadFunctions';

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

    const filename = `${randomUUID()}.${resolved.ext}`;
    const userDir = path.join(UPLOAD_ROOT, userId);
    const filePath = path.join(userDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await mkdir(userDir, { recursive: true });
    await writeFile(filePath, buffer);

    // Verify the write actually landed before telling the client (and the card
    // content) to depend on it — a silent write failure here otherwise surfaces
    // much later as a broken image with no way to tell what went wrong.
    const written = await stat(filePath);
    if (written.size !== buffer.length) {
      throw new Error(`Upload verification failed: wrote ${buffer.length} bytes, disk has ${written.size} at ${filePath}`);
    }

    return NextResponse.json({ url: `/modules/rune/api/uploads/${userId}/${filename}` });
  } catch (error) {
    console.error('Error in POST /modules/rune/api/uploads:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
