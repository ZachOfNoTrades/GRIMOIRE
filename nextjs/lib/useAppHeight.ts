"use client";

import { useEffect } from "react";

/* ─── --app-height: real visible viewport height for locked app shells ───

   Full-height surfaces that lock the window (`body { overflow:hidden }`) — the
   forage dashboard shell, the food-log `.page-with-bottom-bar`, and the fixed
   modal overlay — must fill the visible viewport exactly, with no dead band and
   no clipped bottom bar.

   `100dvh` alone can't do the whole job: the dynamic viewport units exclude the
   browser's retractable toolbars but NOT the soft keyboard, so a locked shell
   sized in dvh stays full-height when the keyboard opens and the focused input
   ends up behind it. `visualViewport.height` is the on-screen height and does
   shrink for the keyboard, so that's what we track, writing it to the
   `--app-height` custom property on <html>; consumers read
   `var(--app-height, 100dvh)` and get the dvh fallback before this runs.

   Implemented as a process-wide singleton: the listeners are an app-lifetime
   concern, so they're installed once and never torn down (multiple mounted
   consumers — dashboard + an open modal — share the one tracker and the one
   value). */

let started = false;

export function startAppHeightTracking(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  const setAppHeight = () => {
    const vv = window.visualViewport;
    const visible = Math.round(vv?.height ?? window.innerHeight ?? 0);
    document.documentElement.style.setProperty("--app-height", `${visible}px`);
  };

  setAppHeight();
  const vv = window.visualViewport;
  window.addEventListener("resize", setAppHeight);
  window.addEventListener("orientationchange", setAppHeight);
  vv?.addEventListener("resize", setAppHeight);
  vv?.addEventListener("scroll", setAppHeight);
}

/** Hook wrapper — call from any client component that renders a locked full-height
 *  shell or a modal, so `--app-height` is pinned while it's mounted. */
export function useAppHeight(): void {
  useEffect(() => {
    startAppHeightTracking();
  }, []);
}
