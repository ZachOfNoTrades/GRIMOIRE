"use client";

import { useState, useEffect } from "react";
import { Timer } from "lucide-react";

interface SessionTimerProps {
  startedAt: Date;
  compact?: boolean;
}

export default function SessionTimer({ startedAt, compact = false }: SessionTimerProps) {

  // STATE
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const formatElapsed = () => {
      const now = new Date();
      const start = new Date(startedAt);
      const diffMs = now.getTime() - start.getTime();

      if (diffMs < 0) return "0:00";

      const totalSeconds = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      const paddedSeconds = seconds.toString().padStart(2, "0");
      const paddedMinutes = hours > 0 ? minutes.toString().padStart(2, "0") : minutes.toString();

      return hours > 0
        ? `${hours}:${paddedMinutes}:${paddedSeconds}`
        : `${paddedMinutes}:${paddedSeconds}`;
    };

    setElapsed(formatElapsed());
    const interval = setInterval(() => setElapsed(formatElapsed()), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

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
