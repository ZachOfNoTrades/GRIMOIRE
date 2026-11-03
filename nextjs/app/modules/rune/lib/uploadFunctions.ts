import { randomUUID } from 'crypto';
import { mkdir, stat, writeFile } from 'fs/promises';
import path from 'path';
import { assertSafeUrl } from '@/app/modules/forage/lib/webPageFetch';

// Pasted card images are stored on local disk (no blob storage exists in this
// repo yet) under a per-user folder outside `public/`, so files are only
// reachable through the auth-gated GET route, not by guessing a static URL.
export const UPLOAD_ROOT = path.join(process.cwd(), 'storage', 'rune-uploads');

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

// Short video clips can also be embedded in a card (rendered as an inline
// <video> player by CardContent). `video/quicktime` covers iPhone .mov files.
export const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogv',
};

// Kept comfortably under the Next.js dev server's own request-body cap
// (`experimental.middlewareClientMaxBodySize`, raised in next.config.ts) —
// a phone-camera photo pasted straight in can easily be 8-12MB.
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12MB (images)

// Video files are much larger than photos; capped well above a typical short
// clip but still bounded so the in-memory read in the upload route can't blow
// the box. The Next body cap in next.config.ts must sit above this.
export const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB (video)

// Resolves an uploaded file's MIME type to its on-disk extension, size cap, and
// media kind — image types first, then video. Returns null for anything else,
// so the upload route stays declarative. `kind` is currently only informational.
export function resolveUpload(
  mimeType: string
): { ext: string; maxBytes: number; kind: 'image' | 'video' } | null {
  const imageExt = ALLOWED_IMAGE_TYPES[mimeType];
  if (imageExt) return { ext: imageExt, maxBytes: MAX_UPLOAD_BYTES, kind: 'image' };

  const videoExt = ALLOWED_VIDEO_TYPES[mimeType];
  if (videoExt) return { ext: videoExt, maxBytes: MAX_VIDEO_UPLOAD_BYTES, kind: 'video' };

  return null;
}

const IMAGE_FETCH_TIMEOUT_MS = 20_000;
const MAX_IMAGE_REDIRECTS = 5;

// Store a file in the user's uploads folder and return the URL a card's markdown embeds
export async function saveUpload(userId: string, buffer: Buffer, ext: string): Promise<string> {
  const filename = `${randomUUID()}.${ext}`;
  const userDir = path.join(UPLOAD_ROOT, userId);
  const filePath = path.join(userDir, filename);
  await mkdir(userDir, { recursive: true });
  await writeFile(filePath, buffer);

  // Verify the write landed, to avoid a card pointing at a broken image
  const written = await stat(filePath);
  if (written.size !== buffer.length) {
    throw new Error(`Upload verification failed: wrote ${buffer.length} bytes, disk has ${written.size} at ${filePath}`);
  }

  return `/modules/rune/api/uploads/${userId}/${filename}`;
}

// Name the image file extension from a file's first bytes, or null when it is not an allowed image
export function detectImageExtension(buffer: Buffer): string | null {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpg';
  const signature = buffer.subarray(0, 6).toString('latin1');
  if (signature === 'GIF87a' || signature === 'GIF89a') return 'gif';
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

// Decode a base64 image, with or without a leading `data:image/...;base64,`
export function decodeBase64Image(encoded: string): Buffer {
  const base64 = encoded.replace(/^data:[^,]*;base64,/, '').replace(/\s/g, '');
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error('imageBase64 is not valid base64');
  }
  return Buffer.from(base64, 'base64');
}

// Read a response body, stopping at the image size limit to avoid holding an oversized file in memory
async function readImageResponse(response: Response): Promise<Buffer> {
  const maxMb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
  if (Number(response.headers.get('content-length')) > MAX_UPLOAD_BYTES) {
    await response.body?.cancel();
    throw new Error(`Image too large (max ${maxMb}MB)`);
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The image link returned nothing');
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    size += part.value.length;
    if (size > MAX_UPLOAD_BYTES) {
      await reader.cancel();
      throw new Error(`Image too large (max ${maxMb}MB)`);
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks);
}

// Download an image from a public link, checking every redirect target to avoid reaching a private address
export async function downloadImage(rawUrl: string): Promise<Buffer> {
  let nextUrl = rawUrl;
  for (let hop = 0; hop <= MAX_IMAGE_REDIRECTS; hop++) {
    const safeUrl = await assertSafeUrl(nextUrl);
    const response = await fetch(safeUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
      headers: { Accept: 'image/*' },
    });

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new Error('The image link redirected nowhere');
      nextUrl = new URL(location, safeUrl).toString();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`The image link answered ${response.status}`);
    }
    return await readImageResponse(response);
  }
  throw new Error('The image link redirected too many times');
}

// Prevents path traversal via a crafted filename/userId in the GET route.
export function isSafePathSegment(segment: string): boolean {
  return /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9]+)?$/.test(segment);
}
