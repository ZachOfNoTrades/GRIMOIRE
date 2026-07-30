"use client";

// Image preloading + dimension cache for the study view. Two jobs:
//   1. Warm the browser cache for images on cards the user is about to reach
//      (see the preload buffer in the deck study page), so advancing to the next
//      card shows its image instantly instead of triggering a fresh download.
//   2. Remember each image's natural width/height as it loads, so CardContent can
//      reserve the correct box up front and avoid the layout jump that a
//      fixed-size placeholder → real image swap otherwise causes.
//
// There is no cheap "size only" HTTP fetch for arbitrary images — the browser has
// to download enough of the file to parse the header — so we simply preload the
// image once and read `naturalWidth/naturalHeight` off the same request the buffer
// already pays for. By the time a buffered card becomes current, its dimensions
// are already known, so its placeholder is sized right on first paint.

export interface ImageDimensions {
  width: number;
  height: number;
}

// Module-level so the cache and in-flight set survive component unmounts and are
// shared across every card's CardContent instance.
const dimensionCache = new Map<string, ImageDimensions>();
const inFlight = new Set<string>();

// Videos share the `![](url)` markdown syntax with images and are told apart by
// extension (see CardContent / the rune upload pipeline) — never preload those here.
function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|ogv)(\?.*)?$/i.test(url);
}

// Pull the image URLs out of a card's markdown (front/back/notes). Matches the
// standard `![alt](url)` form; skips video URLs.
export function extractImageUrls(markdown: string | null | undefined): string[] {
  if (!markdown) return [];
  const urls: string[] = [];
  const imagePattern = /!\[[^\]]*\]\(([^)\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = imagePattern.exec(markdown)) !== null) {
    const url = match[1];
    if (url && !isVideoUrl(url)) urls.push(url);
  }
  return urls;
}

export function getCachedImageDimensions(url: string | undefined): ImageDimensions | undefined {
  return url ? dimensionCache.get(url) : undefined;
}

// Kick off a background preload for a URL if it isn't already cached or loading.
// Resolves the dimensions (from cache or the fresh load); resolves undefined on
// error so callers can fall back to an unsized placeholder.
export function preloadImage(url: string): Promise<ImageDimensions | undefined> {
  if (typeof window === "undefined") return Promise.resolve(undefined);
  const cached = dimensionCache.get(url);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      inFlight.delete(url);
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        const dims = { width: image.naturalWidth, height: image.naturalHeight };
        dimensionCache.set(url, dims);
        resolve(dims);
      } else {
        resolve(undefined);
      }
    };
    image.onerror = () => {
      inFlight.delete(url);
      resolve(undefined);
    };
    inFlight.add(url);
    image.src = url;
  });
}

// Preload every image referenced by a set of card markdown fields. Fire-and-forget
// — used by the study page's look-ahead buffer.
export function preloadCardImages(markdownFields: (string | null | undefined)[]): void {
  if (typeof window === "undefined") return;
  const urls = new Set<string>();
  for (const field of markdownFields) {
    for (const url of extractImageUrls(field)) urls.add(url);
  }
  for (const url of urls) {
    if (!dimensionCache.has(url) && !inFlight.has(url)) void preloadImage(url);
  }
}
