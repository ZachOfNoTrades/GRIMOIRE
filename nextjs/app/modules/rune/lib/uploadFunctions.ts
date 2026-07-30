import path from 'path';

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

// Prevents path traversal via a crafted filename/userId in the GET route.
export function isSafePathSegment(segment: string): boolean {
  return /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9]+)?$/.test(segment);
}
