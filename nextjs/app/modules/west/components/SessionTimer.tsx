"use client";

import { useState, useEffect } from "react";
import { Timer } from "lucide-react";
import { formatDuration } from "../utils/format";

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
      const diffMs = now.getTime() - start.getTime();
      if (diffMs < 0) return "00:00:00";
      return formatDuration(offsetSeconds + Math.floor(diffMs / 1000));
    };

    setElapsed(formatElapsed());
    const interval = setInterval(() => setElapsed(formatElapsed()), 1000);
    return () => clearInterval(interval);
  }, [startedAt, offsetSeconds]);

  if (compact) {
    return (
      <span className="text-sm status-active-text">{elapsed}</span>
    );
  }

  return (
    <div className="flex items-center gap-1.5 status-active-text">

      {/* TIMER ICON */}
      <Timer className="w-4 h-4" />

      {/* ELAPSED TIME */}
      <span className="font-mono font-medium">{elapsed}</span>
    </div>
  );
}
