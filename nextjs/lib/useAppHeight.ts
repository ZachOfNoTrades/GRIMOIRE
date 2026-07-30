"use client";

import { useEffect } from "react";

/* ─── --app-height: real visible viewport height for locked app shells ───

   Full-height surfaces that lock the window (`body { overflow:hidden }`) — the
   forage dashboard shell, the food-log `.page-with-bottom-bar`, and the fixed
   modal overlay — must fill the visible viewport exactly: no dead band, no
   clipped bottom bar, across mobile browsers' dynamic toolbars.

   The CSS viewport units alone can't do this portably here, because a *locked*
   window can't scroll to retract the toolbar:
     - svh / dvh / visualViewport.height = the SMALL viewport (toolbar-shown).
       Correct on Chromium + WebKit, which genuinely paint only that area.
     - lvh = the LARGE viewport (toolbar-retracted). Per spec this OVERSHOOTS a
       locked window (CSS Values 4: lvh assumes the toolbar is already hidden).

   Firefox Android is the exception. With the window locked its top URL bar never
   collapses, yet Firefox keeps the ICB at the LARGE size and *paints* it while
   reporting the SMALL viewport via visualViewport / innerHeight / dvh
   (Bugzilla 1586144 + 1217212). Measured on a Galaxy S22:
     dvh = svh = innerHeight = visualViewport.height = 674,  lvh = 737,
   and 737 is what's actually painted — so sizing to 674 left a 63px (lvh-dvh)
   dead band below the tab bar. On Firefox we therefore fill the large viewport
   with `100lvh`; a CSS custom property may hold a unit token, so CSS resolves it
   (no probe element / measurement needed). FxiOS is WebKit and lacks "Firefox"
   in its UA, so it correctly falls through to the visualViewport path.

   We write the result to the `--app-height` custom property on <html>; consumers
   read `var(--app-height, 100svh)`. visualViewport tracking also makes the shell
   shrink when the on-screen keyboard opens (the height drops to the visible
   area), which the static `lvh` token can't do — an accepted trade-off on
   Firefox, where avoiding the dead band matters more for these shells.

   Implemented as a process-wide singleton: the listeners are an app-lifetime
   concern, so they're installed once and never torn down (multiple mounted
   consumers — dashboard + an open modal — share the one tracker and the one
   value). */

let started = false;

export function startAppHeightTracking(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  const isGeckoFirefox = /firefox/i.test(navigator.userAgent);

  const setAppHeight = () => {
    const vv = window.visualViewport;
    const innerH = window.innerHeight || 0;
    const visible = Math.round(vv?.height ?? innerH);
    // The keyboard, when open, drops visualViewport.height well below the layout
    // viewport; innerHeight stays put on Firefox Android, so the delta detects it.
    const keyboardOpen = innerH - visible > 100;

    if (isGeckoFirefox) {
      // Locked PAGE shells (dashboard, food-log) always fill Firefox's painted
      // (large) viewport via the lvh token to avoid the dead band (see above).
      document.documentElement.style.setProperty("--app-height", "100lvh");

      // --visible-vh drives overlays (the modal). Firefox Android PAINTS the lvh
      // viewport but reports the smaller dvh via visualViewport.height — so when
      // the keyboard is CLOSED we must size the modal to `100lvh` (the genuinely
      // painted height), or the footer ends a dead-band short of the screen
      // bottom, leaving a gap below it. Only when the keyboard OPENS does
      // visualViewport.height become the right number (the area above the
      // keyboard) — pin to that so the footer rides above the keyboard.
      // NB: the emulator's lvh overshoots the screen and is NOT faithful to this
      // quirk; the physical phone is the ground truth.
      document.documentElement.style.setProperty(
        "--visible-vh",
        keyboardOpen ? `${visible}px` : "100lvh"
      );
      return;
    }
    // Chromium / WebKit genuinely paint only the visible viewport, so both the
    // shell and overlays track visualViewport.height directly (it already shrinks
    // for the keyboard).
    document.documentElement.style.setProperty("--app-height", `${visible}px`);
    document.documentElement.style.setProperty("--visible-vh", `${visible}px`);
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
