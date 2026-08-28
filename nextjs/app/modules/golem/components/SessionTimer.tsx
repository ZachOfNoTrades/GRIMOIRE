"use client";

import { useState, useEffect } from "react";
import { Timer } from "lucide-react";
import { formatDuration } from "../utils/format";
import { STALE_SESSION_IDLE_SECONDS } from "../lib/staleSessionTimer";

// Standing explanation of the auto-trim, so the rule is discoverable from the clock itself and not
// only from the toast that fires the one time it applies (see lib/staleSessionTimer).
const TIMER_HINT = `Elapsed session time. Left running for over ${STALE_SESSION_IDLE_SECONDS / 3600} hours with nothing logged, it is trimmed back to your last logged set.`;

interface SessionTimerProps {
  startedAt: Date;
  offsetSeconds?: number;
  compact?: boolean;
}

export default function SessionTimer({ startedAt, offsetSeconds = 0, compact = false }: SessionTimerProps) {

  // STATE
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const formatElapsed = () => {
      const now = new Date();
      const start = new Date(startedAt);
      // Only the CURRENT leg can be negative — the device clock sitting behind whatever stamped
      // `startedAt` (the server does now, when it trims an abandoned clock). Clamping just the leg
      // keeps the seconds already banked in `offsetSeconds` on screen; zeroing the whole readout
      // made a trimmed session flash 00:00:00 and read as lost time.
      const diffMs = now.getTime() - start.getTime();
      return formatDuration(offsetSeconds + Math.max(0, Math.floor(diffMs / 1000)));
    };

    setElapsed(formatElapsed());
    const interval = setInterval(() => setElapsed(formatElapsed()), 1000);
    return () => clearInterval(interval);
  }, [startedAt, offsetSeconds]);

  if (compact) {
    return (
      <span className="text-sm status-active-text" title={TIMER_HINT} aria-label={TIMER_HINT}>{elapsed}</span>
    );
  }

  return (
    <div className="flex items-center gap-1.5 status-active-text" title={TIMER_HINT} aria-label={TIMER_HINT}>

      {/* TIMER ICON */}
      <Timer className="w-4 h-4" />

      {/* ELAPSED TIME */}
      <span className="font-mono font-medium">{elapsed}</span>
    </div>
  );
}
