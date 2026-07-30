"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Timer, Plus, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RestTimerProps {
  // Epoch ms when the current rest ends; the pill self-ticks toward this.
  endsAt: number;
  // Adjust the running rest (and the saved default) by delta seconds.
  onAdjust: (deltaSeconds: number) => void;
  // Dismiss the timer (manual skip, or auto once the rest has elapsed).
  onSkip: () => void;
}

// Floating between-sets rest countdown. Started when a working set is marked complete,
// it counts down to zero, then flips to a "Rest up!" state (one vibration) and
// auto-dismisses a few seconds later. Renders fixed above the segment modal (whose
// backdrop is z-index 50) so it stays visible the whole time the user logs sets.
export default function RestTimer({ endsAt, onAdjust, onSkip }: RestTimerProps) {

  // STATE
  const [now, setNow] = useState(() => Date.now());
  // Portal to <body> so the fixed pill's z-index sits above the segment modal (which is
  // itself portaled to body at z-index 50). Rendered in the page tree it'd be trapped under
  // any ancestor stacking context and the modal would paint over it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // Guards the one-time buzz so it fires once per rest, not every tick at zero.
  const hasBuzzedRef = useRef(false);

  // Tick toward endsAt. 250ms keeps the readout smooth without re-rendering the page.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);

  // DERIVED
  const remainingMs = endsAt - now;
  const isDone = remainingMs <= 0;
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const label = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, "0")}`;

  // On elapse: buzz once and auto-dismiss after a grace period. Resets if the user
  // extends the rest (+15s) back above zero so a later elapse buzzes again.
  useEffect(() => {
    if (!isDone) {
      hasBuzzedRef.current = false;
      return;
    }
    if (hasBuzzedRef.current) return;
    hasBuzzedRef.current = true;
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([120, 60, 120]);
    const timeout = setTimeout(onSkip, 5000);
    return () => clearTimeout(timeout);
  }, [isDone, onSkip]);

  if (!mounted) return null;

  return createPortal(
    <div className={`rest-timer-pill ${isDone ? "rest-timer-pill-done" : ""}`} role="status" aria-live="polite">

      {/* REST ICON */}
      <Timer className="w-4 h-4" />

      {/* TIME / DONE LABEL */}
      <span className="rest-timer-time">{isDone ? "Rest up!" : label}</span>

      {/* SUBTRACT 15s */}
      <Button onClick={() => onAdjust(-15)} className="btn-link" title="Rest 15s less">
        <Minus className="w-4 h-4" />
      </Button>

      {/* ADD 15s */}
      <Button onClick={() => onAdjust(15)} className="btn-link" title="Rest 15s more">
        <Plus className="w-4 h-4" />
      </Button>

      {/* SKIP / DISMISS */}
      <Button onClick={onSkip} className="btn-link" title="Skip rest">
        <X className="w-4 h-4" />
      </Button>
    </div>,
    document.body
  );
}
