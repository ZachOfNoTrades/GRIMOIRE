"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/* ─── --nav-safe-top: lift the navbar out from behind the Firefox-Android URL bar ───

   The locked full-height app shells (globals.css `body:has(.page)` /
   `body:has(.page-with-bottom-bar)`) are `overflow:hidden` and sized to the large
   (`100lvh`) viewport. On Firefox Android that shell is anchored to the LARGE
   layout viewport, whose top can sit up to (lvh - dvh) px ABOVE the visible area
   while the URL bar is shown — so the in-flow navbar (the shell's first child)
   renders off the top of the screen, and because the shell can't scroll, nothing
   recovers it: scrolling and refresh don't help, only navigating to a normal-flow
   page does (Bugzilla 1586144/1217212). Reported as "navbar doesn't show up when I
   reopen Firefox with grimoire already open".

   The clip is STATE-DEPENDENT, not a constant: the same page is sometimes anchored
   with its top flush to the visible top (no clip) and sometimes pushed up by the
   toolbar height. So a fixed `calc(100lvh - 100dvh)` pad over-compensates in the
   flush state, leaving a gap ABOVE the navbar. Instead we measure the ACTUAL clip
   — how far the locked shell's top is above the viewport — and pad the shell down
   by exactly that. `body` IS the locked shell, so its border-box top (negative
   when clipped) is the measurement; it's independent of the padding we apply
   (border-box), so this converges in one frame. On engines that paint the visible
   viewport directly (Chromium/WebKit) the shell top is never above the viewport,
   so the measurement is 0 and nothing is padded — no engine sniffing needed. */
export default function NavSafeAreaSync() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;

    const sync = () => {
      // Only a locked (overflow:hidden) full-height shell can be pushed off the
      // top; a normal scrollable page's negative body-top is just scroll, which
      // must not be mistaken for a clip.
      const lockedShell = document.querySelector(".page, .page-with-bottom-bar");
      const clip = lockedShell
        ? Math.max(0, Math.round(-document.body.getBoundingClientRect().top))
        : 0;
      root.style.setProperty("--nav-safe-top", clip + "px");
    };

    // Measure after layout (rAF), and coalesce bursts of events into one measure.
    let frame = requestAnimationFrame(sync);
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };

    // The clip changes when the toolbar/viewport geometry changes (rotate, resize)
    // and — the reported case — when a frozen tab is restored to the foreground
    // (pageshow from bfcache, or a visibility→visible resume), where no resize
    // necessarily fires. visualViewport tracks the URL bar sliding.
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("pageshow", schedule);
    document.addEventListener("visibilitychange", schedule);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("pageshow", schedule);
      document.removeEventListener("visibilitychange", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
    };
    // Re-measure on client navigation too: the locked-shell presence (and thus the
    // clip) changes per route, and route changes fire none of the events above.
  }, [pathname]);

  return null;
}
