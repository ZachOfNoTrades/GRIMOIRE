"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UseGenerationJobOptions {
  onComplete?: (result: unknown) => void;
  onError?: (error: string) => void;
  pollIntervalMs?: number;
}

export function useGenerationJob(options: UseGenerationJobOptions = {}) {
  const defaultInterval = parseInt(process.env.NEXT_PUBLIC_GENERATION_POLL_INTERVAL_MS || "3000", 10);
  const { onComplete, onError, pollIntervalMs = defaultInterval } = options;
  const [jobId, setJobId] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  // Keep refs updated without re-triggering effect
  onCompleteRef.current = onComplete;
  onErrorRef.current = onError;

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
    setJobId(null);
  }, []);

  const startPolling = useCallback((id: string) => {
    setJobId(id);
    setIsPolling(true);
  }, []);

  useEffect(() => {
    if (!jobId || !isPolling) return;

    const poll = async () => {
      try {
        const response = await fetch(`/api/generation-jobs/${jobId}`);
        if (!response.ok) {
          stopPolling();
          onErrorRef.current?.("Failed to check job status");
          return;
        }
        const data = await response.json();
        if (data.status === "completed") {
          stopPolling();
          onCompleteRef.current?.(data.result);
        } else if (data.status === "failed") {
          stopPolling();
          onErrorRef.current?.(data.error || "Generation failed");
        }
      } catch {
        stopPolling();
        onErrorRef.current?.("Failed to check job status");
      }
    };

    // Poll immediately, then on interval
    poll();
    intervalRef.current = setInterval(poll, pollIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [jobId, isPolling, pollIntervalMs, stopPolling]);

  return { startPolling, isPolling, stopPolling };
}
