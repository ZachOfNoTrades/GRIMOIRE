import { open, stat } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedUser } from '@/lib/permissions';
import { UPLOAD_ROOT, isSafePathSegment } from '../../../../lib/uploadFunctions';
import { canViewUpload } from '../../../../lib/shareFunctions';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
};

// Reads a byte slice [start, end] (inclusive) from a file without loading the
// whole thing into memory — used to answer HTTP Range requests for video.
async function readSlice(filePath: string, start: number, end: number): Promise<Buffer> {
  const length = end - start + 1;
  const buffer = Buffer.alloc(length);
  const handle = await open(filePath, 'r');
  try {
    await handle.read(buffer, 0, length, start);
  } finally {
    await handle.close();
  }
  return buffer;
}

// Streams back a pasted card image or video. Gated behind auth (not served from
// `public/`). A user always reaches their own uploads folder; someone else's file is served
// only when it's embedded in a card of a deck the requester can open — which is how a shared
// deck's images reach its sharees, and an editor's pasted images reach the owner. Video
// playback (and seeking) needs HTTP Range support — browsers, iOS Safari in
// particular, issue `Range` requests and expect `206 Partial Content` back.
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string; filename: string }> }
) {
  const session = await getAuthorizedUser(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { userId, filename } = await context.params;
  if (!isSafePathSegment(userId) || !isSafePathSegment(filename)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  if (session.user.id?.toLowerCase() !== userId.toLowerCase()
    && !(await canViewUpload({ id: session.user.id!, email: session.user.email }, userId, filename))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const extension = filename.split('.').pop() || '';
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const filePath = path.join(UPLOAD_ROOT, userId, filename);

  let fileSize: number;
  try {
    fileSize = (await stat(filePath)).size;
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const baseHeaders = {
    'Content-Type': contentType,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
  };

  try {
    // A `Range: bytes=start-end` header means the client (a <video>/<audio>
    // element, typically) wants only a slice so it can stream/seek. Either
    // bound may be omitted: `bytes=500-` (from 500 to end) or `bytes=-500`
    // (last 500 bytes).
    const rangeHeader = request.headers.get('range');
    const rangeMatch = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;

    if (rangeMatch && (rangeMatch[1] !== '' || rangeMatch[2] !== '')) {
      let start: number;
      let end: number;
      if (rangeMatch[1] === '') {
        // Suffix range: last N bytes.
        const suffixLength = parseInt(rangeMatch[2], 10);
        start = Math.max(fileSize - suffixLength, 0);
        end = fileSize - 1;
      } else {
        start = parseInt(rangeMatch[1], 10);
        end = rangeMatch[2] === '' ? fileSize - 1 : parseInt(rangeMatch[2], 10);
      }
      end = Math.min(end, fileSize - 1);

      // Unsatisfiable range (start past EOF or inverted) → 416 with the valid size.
      if (start > end || start >= fileSize) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${fileSize}`, 'Accept-Ranges': 'bytes' },
        });
      }

      const slice = await readSlice(filePath, start, end);
      return new NextResponse(new Uint8Array(slice), {
        status: 206,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': String(end - start + 1),
        },
      });
    }

    // No (usable) Range header — return the whole file.
    const data = await readSlice(filePath, 0, fileSize - 1);
    return new NextResponse(new Uint8Array(data), {
      headers: { ...baseHeaders, 'Content-Length': String(fileSize) },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
