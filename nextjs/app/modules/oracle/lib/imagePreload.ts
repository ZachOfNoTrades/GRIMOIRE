"use client";

import { useEffect, useRef, useState } from "react";

// Pictures at the table must never arrive late: a map that paints before its background, or a
// portrait that pops in after the panel, is the DM showing the players a half-drawn screen.
//
// Every picture is therefore either loaded before the thing that needs it is drawn, or holds its
// place with a box of the same size while it loads. This keeps the one cache both ends read:
// what has loaded, and how big it turned out to be.
//
// There is no cheap way to ask for an image's size alone — the browser has to read enough of the
// file to parse the header — so the size is taken off the same load that warms the cache.

export interface PictureSize {
  width: number;
  height: number;
}

// Module level, so what one panel loaded is known to the next without loading it again.
const sizes = new Map<string, PictureSize>();
const loading = new Map<string, Promise<PictureSize | undefined>>();

export const pictureSize = (url: string | null | undefined): PictureSize | undefined => (url ? sizes.get(url) : undefined);

export const isPictureReady = (url: string | null | undefined): boolean => !!url && sizes.has(url);

/** Load a picture into the browser's cache, and remember how big it is. Safe to call repeatedly. */
export function loadPicture(url: string): Promise<PictureSize | undefined> {
  if (typeof window === "undefined") return Promise.resolve(undefined);
  const known = sizes.get(url);
  if (known) return Promise.resolve(known);
  const already = loading.get(url);
  if (already) return already;

  const job = new Promise<PictureSize | undefined>((resolve) => {
    const picture = new Image();
    picture.onload = () => {
      loading.delete(url);
      if (picture.naturalWidth > 0 && picture.naturalHeight > 0) {
        const size = { width: picture.naturalWidth, height: picture.naturalHeight };
        sizes.set(url, size);
        resolve(size);
      } else {
        resolve(undefined);
      }
    };
    picture.onerror = () => {
      loading.delete(url);
      resolve(undefined);
    };
    picture.src = url;
  });
  loading.set(url, job);
  return job;
}

/** Warm a set of pictures in the background. Nothing waits on it. */
export function loadPictures(urls: (string | null | undefined)[]): void {
  if (typeof window === "undefined") return;
  for (const url of urls) {
    if (url && !sizes.has(url) && !loading.has(url)) void loadPicture(url);
  }
}

/** How big a picture is, loading it in the background if its size is not known yet. */
export function usePictureSize(url: string | null | undefined): PictureSize | undefined {
  const [size, setSize] = useState<PictureSize | undefined>(() => pictureSize(url));
  useEffect(() => {
    if (!url) {
      setSize(undefined);
      return;
    }
    const known = pictureSize(url);
    setSize(known);
    if (known) return;
    let stopped = false;
    void loadPicture(url).then((found) => {
      if (!stopped) setSize(found);
    });
    return () => {
      stopped = true;
    };
  }, [url]);
  return size;
}

/** How long to wait on a picture before drawing without it. */
export const PICTURE_WAIT_MS = 4000;

/**
 * Hold `next` back until the picture it needs has loaded, so the thing is drawn complete or not
 * at all. Used for map backgrounds, where the geometry is SVG and paints at once while the
 * picture has to come down the wire: without this, changing maps puts the new party position on
 * the old map's picture for a moment.
 *
 * A change that does not bring a new picture is passed straight through, so tokens moving and fog
 * opening are never delayed. A picture that never arrives gives up after PICTURE_WAIT_MS rather
 * than stranding the table on what was there before.
 */
export function useWhenPictureReady<T>(next: T | null, pictureUrl: (value: T) => string | null): T | null {
  const [shown, setShown] = useState<T | null>(() => {
    if (!next) return null;
    const url = pictureUrl(next);
    return !url || isPictureReady(url) ? next : null;
  });
  const drawnRef = useRef<string | null>(next && isPictureReady(pictureUrl(next)) ? pictureUrl(next) : null);

  useEffect(() => {
    if (!next) {
      drawnRef.current = null;
      setShown(null);
      return;
    }
    const url = pictureUrl(next);
    if (!url || url === drawnRef.current || isPictureReady(url)) {
      drawnRef.current = url;
      setShown(next);
      return;
    }
    let stopped = false;
    const show = () => {
      if (stopped) return;
      drawnRef.current = url;
      setShown(next);
    };
    void loadPicture(url).then(show);
    const giveUp = setTimeout(show, PICTURE_WAIT_MS);
    return () => {
      stopped = true;
      clearTimeout(giveUp);
    };
  }, [next, pictureUrl]);

  return shown;
}
