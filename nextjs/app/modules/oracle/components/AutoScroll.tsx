"use client";

import { useEffect, useRef } from "react";

const SPEED = 22; // px a second
const HOLD_TOP_MS = 5000;
const HOLD_BOTTOM_MS = 5000;
const HOLD_NEW_MS = 9000; // at the bottom after something new arrives there
const HAND_OFF_MS = 8000; // after a wheel or touch, before it scrolls on its own again

interface AutoScrollProps {
  className?: string;
  resetKey: string; // a new value starts over from the top
  revealKey?: string; // a new non-empty value glides to the bottom, where new content lands
  children: React.ReactNode;
}

// A column for the player screen that slowly scrolls whatever does not fit into view, holds at the
// end, glides back to the top and goes again. A wheel or touch takes over for a while. With reduced
// motion it is a plain scrolling column.
export default function AutoScroll({ className, resetKey, revealKey = "", children }: AutoScrollProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ phase: "top" as "top" | "down" | "bottom", until: 0, position: 0, handOffUntil: 0 });

  // RUN
  useEffect(() => {
    const box = boxRef.current;
    if (!box || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const state = stateRef.current;
    box.scrollTop = 0;
    Object.assign(state, { phase: "top", until: performance.now() + HOLD_TOP_MS, position: 0, handOffUntil: 0 });
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const elapsed = last ? Math.min(100, now - last) : 0;
      last = now;
      const max = box.scrollHeight - box.clientHeight;
      const overflows = max > 1;
      if ((box.dataset.overflow === "true") !== overflows) box.dataset.overflow = overflows ? "true" : "false";
      if (!overflows) {
        Object.assign(state, { phase: "top", until: now + HOLD_TOP_MS, position: 0 });
        return;
      }
      if (now < state.handOffUntil) {
        state.position = box.scrollTop;
        return;
      }
      if (state.phase === "top") {
        if (now >= state.until) {
          state.phase = "down";
          state.position = box.scrollTop;
        }
      } else if (state.phase === "down") {
        state.position = Math.min(max, state.position + (SPEED * elapsed) / 1000);
        box.scrollTop = state.position;
        if (state.position >= max) Object.assign(state, { phase: "bottom", until: now + HOLD_BOTTOM_MS });
      } else if (now >= state.until) {
        box.scrollTo({ top: 0, behavior: "smooth" });
        Object.assign(state, { phase: "top", until: now + HOLD_TOP_MS + 1000, position: 0 });
      }
    };
    const handOff = () => {
      state.handOffUntil = performance.now() + HAND_OFF_MS;
      state.phase = "down";
    };
    box.addEventListener("wheel", handOff, { passive: true });
    box.addEventListener("touchstart", handOff, { passive: true });
    box.addEventListener("pointerdown", handOff);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      box.removeEventListener("wheel", handOff);
      box.removeEventListener("touchstart", handOff);
      box.removeEventListener("pointerdown", handOff);
    };
  }, [resetKey]);

  // NEW CONTENT — glide down to it and stay a while
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !revealKey || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setTimeout(() => {
      const max = box.scrollHeight - box.clientHeight;
      if (max <= 1) return;
      box.scrollTo({ top: max, behavior: "smooth" });
      Object.assign(stateRef.current, { phase: "bottom", until: performance.now() + HOLD_NEW_MS, position: max, handOffUntil: 0 });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [revealKey]);

  return (
    <div ref={boxRef} className={className}>
      {children}
    </div>
  );
}
