"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionSnapshot } from "../types/damnation";

// Live session updates for the board and the phones.
//
// Reads Server-Sent Events with fetch rather than EventSource: EventSource can't send the
// X-Damnation-Token header, and fetch exposes the HTTP status, so a removed player (401), an
// ended game (410) and a full server (429) are told apart instead of retried forever.
//
// The dev server restarts and phones sleep, so a dropped stream is routine. Every
// reconnect receives a fresh full snapshot as its first event, and snapshots older than
// the newest one seen are ignored — so a late broadcast can never roll the UI backwards.

export type ConnectionState = "connecting" | "live" | "reconnecting" | "ended" | "revoked";

export interface Presence {
  connected_player_ids: string[];
  host_connected: boolean;
}

interface Options<T extends SessionSnapshot> {
  url: string | null;
  headers?: Record<string, string>;
  // Fired when the server ends this client's access (removed, left, game ended).
  onRevoked?: (reason: string) => void;
  initial?: T | null;
}

// A healthy stream carries a heartbeat every 20 s; silence well beyond that means the
// connection died without closing (common after a phone wakes from sleep).
const STALL_MS = 45_000;
// Capped low: a dev-server restart takes ~15 s, and the table should be back seconds after it is.
const MAX_BACKOFF_MS = 8_000;

export function useSessionStream<T extends SessionSnapshot>({ url, headers, onRevoked, initial = null }: Options<T>) {
  // DATA
  const [snapshot, setSnapshot] = useState<T | null>(initial);
  const [presence, setPresence] = useState<Presence | null>(null);

  // STATE
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const versionRef = useRef(initial?.version ?? -1);
  const headersRef = useRef(headers);
  const revokedRef = useRef(onRevoked);
  headersRef.current = headers;
  revokedRef.current = onRevoked;
  const reconnectRef = useRef<() => void>(() => {});

  // Shared version guard for both stream events and HTTP mutation responses.
  const acceptSnapshot = useCallback((next: T) => {
    if (next.version < versionRef.current) return;
    versionRef.current = next.version;
    setSnapshot(next);
  }, []);

  useEffect(() => {
    if (!url) return;
    let disposed = false;
    let controller: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stallTimer: ReturnType<typeof setInterval> | undefined;
    let attempt = 0;
    let lastByteAt = Date.now();

    const stopForGood = (state: ConnectionState) => {
      disposed = true;
      setConnection(state);
      controller?.abort();
      clearTimeout(retryTimer);
    };

    const scheduleRetry = () => {
      if (disposed) return;
      setConnection("reconnecting");
      attempt += 1;
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(attempt - 1, 3)) + Math.random() * 500;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, delay);
    };

    const handleEvent = (type: string, data: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
      if (type === "snapshot") acceptSnapshot(parsed as T);
      else if (type === "presence") setPresence(parsed as Presence);
      else if (type === "revoked") {
        const reason = (parsed as { reason?: string }).reason ?? "revoked";
        stopForGood(reason === "ended" ? "ended" : "revoked");
        revokedRef.current?.(reason);
      }
    };

    async function connect() {
      if (disposed) return;
      controller?.abort();
      controller = new AbortController();
      const current = controller;
      try {
        const response = await fetch(url!, {
          headers: headersRef.current,
          signal: current.signal,
          cache: "no-store",
        });
        if (response.status === 401 || response.status === 403 || response.status === 404) {
          stopForGood("revoked");
          revokedRef.current?.(response.status === 404 ? "not_found" : "unauthorized");
          return;
        }
        if (response.status === 410) {
          stopForGood("ended");
          revokedRef.current?.("ended");
          return;
        }
        if (!response.ok || !response.body) {
          scheduleRetry();
          return;
        }

        setConnection("live");
        attempt = 0;
        lastByteAt = Date.now();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          lastByteAt = Date.now();
          buffer += decoder.decode(value, { stream: true });
          let boundary: number;
          while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            let type = "message";
            const dataLines: string[] = [];
            for (const line of block.split("\n")) {
              if (line.startsWith("event: ")) type = line.slice(7);
              else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
            }
            if (dataLines.length > 0) handleEvent(type, dataLines.join("\n"));
          }
        }
        // The server closed the stream (restart, eviction) — come back.
        if (!disposed && current === controller) scheduleRetry();
      } catch {
        if (!disposed && current === controller) scheduleRetry();
      }
    }

    reconnectRef.current = () => {
      if (disposed) return;
      attempt = 0;
      clearTimeout(retryTimer);
      connect();
    };

    // STALL WATCHDOG
    stallTimer = setInterval(() => {
      if (!disposed && Date.now() - lastByteAt > STALL_MS) {
        lastByteAt = Date.now();
        reconnectRef.current();
      }
    }, 10_000);

    // A phone coming back from the lock screen or regaining signal reconnects immediately
    // instead of waiting out the backoff or the stall watchdog.
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastByteAt > 25_000) reconnectRef.current();
    };
    const onOnline = () => reconnectRef.current();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    setConnection("connecting");
    connect();

    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(retryTimer);
      clearInterval(stallTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [url, acceptSnapshot]);

  return { snapshot, presence, connection, acceptSnapshot, reconnect: () => reconnectRef.current() };
}
