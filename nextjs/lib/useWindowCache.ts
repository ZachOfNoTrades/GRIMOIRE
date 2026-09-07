"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ─── useWindowCache: keep every filter's payload, warm the ones not selected ───

   The problem this exists for: a page whose whole body is fetched per filter
   (forage's Nutrition range selector — Today / 1W / 1M / 3M / 1Y / Custom) tears
   itself down on every tap. The old shape was one `isLoading` flag gating the
   render, so switching filters:
     1. dropped the "Daily average over N logged days" caption out of the flow,
        shifting everything below it up ~25px,
     2. re-rendered the sections a beat later, shifting them back down,
     3. re-fetched a window the user had already viewed seconds earlier.
   Three visible steps for what the user experiences as one choice.

   The fix is a cache plus a background warm, not a spinner:
     - Every window's payload is kept, keyed by a caller-chosen string. Selecting
       a window that's already cached paints it in the SAME frame as the tap —
       there is no in-between state to flicker.
     - Once the active window has landed, the sibling keys (`prefetchKeys`) are
       fetched SEQUENTIALLY in the background, so by the time a user reaches for
       a second filter it is usually already warm, and first paint never competes
       with the warm-up.
     - When a window is not yet warm, the previously-shown payload is held
        instead of blanking — `data`/`dataKey` stay in lockstep, so a caller that
        renders its labels off `dataKey` swaps the entire view atomically rather
        than showing new labels over old numbers.

   `resetToken` invalidates everything (e.g. after a log lands and the totals are
   stale); changing it clears the cache and re-runs the active load + warm-up.

   Deliberately NOT a revalidating cache: a hit is served as-is. These windows are
   day-grained aggregates, and re-fetching behind the user's back is exactly the
   churn this hook exists to remove. */

// A settled window: either the loaded payload, or a marked failure so a broken
// window renders its empty state once instead of spinning forever.
type Entry<T> = { ok: true; value: T } | { ok: false };

export interface WindowCacheResult<T> {
  // Payload for `dataKey` — the active window once it has loaded, else the last
  // window that did (null before anything has).
  data: T | null;
  // Which window `data` actually describes. Render window-derived labels off THIS,
  // never off the selected key, so labels and numbers can never disagree.
  dataKey: string | null;
  // Nothing to show at all yet (first load, or the first load failed).
  isLoading: boolean;
  // A different window is in flight while `data` still shows the previous one.
  isRefreshing: boolean;
  // The ACTIVE window settled as a failure. `data` may still hold the previous
  // window — callers should say so rather than presenting it as the selection.
  isError: boolean;
}

export function useWindowCache<T>(
  // The selected window, or null when it isn't resolvable yet (e.g. a custom
  // range with only one end picked) — null loads nothing and holds the last view.
  key: string | null,
  // Loads one window. Called at most once per key per cache generation.
  load: (key: string) => Promise<T>,
  options: { prefetchKeys?: string[]; resetToken?: unknown } = {},
): WindowCacheResult<T> {
  const { prefetchKeys, resetToken } = options;

  const cacheRef = useRef(new Map<string, Entry<T>>());
  const inflightRef = useRef(new Map<string, Promise<void>>());
  // Last payload that successfully rendered — what we fall back to while a cold
  // window loads, so the page never blanks mid-switch. Held OUTSIDE the cache so
  // it also survives a `resetToken` invalidation (a refresh after a log lands
  // shouldn't tear the page down either).
  const lastGoodRef = useRef<{ key: string; value: T } | null>(null);

  // `load` is re-created every render by callers; hold it in a ref so it never
  // re-triggers the effect (which would refetch on every parent render).
  const loadRef = useRef(load);
  loadRef.current = load;

  // Cache writes happen outside React state; bump to re-render after each one.
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  // Cache generation — bumped by `resetToken`, and a dep of the load effect so a
  // reset re-runs the active fetch.
  const [generation, setGeneration] = useState(0);
  const lastResetRef = useRef(resetToken);
  useEffect(() => {
    if (Object.is(lastResetRef.current, resetToken)) return;
    lastResetRef.current = resetToken;
    cacheRef.current = new Map();
    inflightRef.current = new Map();
    setGeneration((g) => g + 1);
  }, [resetToken]);

  // Fetch a window once. Dedupes concurrent callers (the active load and the
  // background warm can ask for the same key) and never re-fetches a cache hit.
  const ensure = useCallback((k: string): Promise<void> => {
    if (cacheRef.current.has(k)) return Promise.resolve();
    const inflight = inflightRef.current.get(k);
    if (inflight) return inflight;
    const gen = cacheRef.current;
    const p = Promise.resolve()
      .then(() => loadRef.current(k))
      .then(
        (value) => { if (cacheRef.current === gen) cacheRef.current.set(k, { ok: true, value }); },
        (e) => { console.error(e); if (cacheRef.current === gen) cacheRef.current.set(k, { ok: false }); },
      )
      .finally(() => { inflightRef.current.delete(k); bump(); });
    inflightRef.current.set(k, p);
    return p;
  }, [bump]);

  // Load the active window, then warm the rest one at a time behind it.
  const prefetchSig = (prefetchKeys ?? []).join(",");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    ensure(key).then(async () => {
      for (const k of prefetchSig ? prefetchSig.split(",") : []) {
        if (!alive) return;
        await ensure(k);
      }
    });
    return () => { alive = false; };
  }, [key, prefetchSig, ensure, generation]);

  // Prefer the active window; fall back to the last one that rendered so a cold
  // switch (or a failed one) holds the previous view instead of collapsing.
  const activeEntry = key ? cacheRef.current.get(key) : undefined;
  if (key && activeEntry?.ok) lastGoodRef.current = { key, value: activeEntry.value };
  const shown = lastGoodRef.current;

  return {
    data: shown ? shown.value : null,
    dataKey: shown ? shown.key : null,
    // Settled-but-failed with nothing to fall back on is NOT loading — the caller
    // renders its empty state rather than spinning forever.
    isLoading: !shown && activeEntry === undefined && key !== null,
    isRefreshing: !!shown && key !== null && activeEntry === undefined,
    isError: activeEntry !== undefined && !activeEntry.ok,
  };
}
