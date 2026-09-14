"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateUUID } from "@/lib/uuid";
import { MAX_DELTA } from "./constants";
import type { SessionSnapshot } from "../types/damnation";

// Sends game changes for the board and the phones.
//
// - Taps on the same counter coalesce into one request until COALESCE_MS pass without another
//   tap, so a run of "−1"s becomes one "−5": less load, a readable activity feed, and one undo
//   per burst. Leaving the page (tab hidden, phone locked, tab closed) sends what's waiting
//   straight away.
// - Requests go one at a time, in order, each with a client-generated op_id. A request that
//   fails on the network (or a 5xx / 429) is resent with the SAME op_id, so the server applies
//   it exactly once however many times it arrives.
// - Until the server confirms a change, it is shown as a pending overlay on top of the last
//   snapshot. It clears when the op_id shows up in a snapshot's event list or the request
//   returns, whichever comes first, so a broadcast arriving before the response can't double-count.
//   The event-list check happens while rendering that snapshot, not in an effect afterwards —
//   otherwise the new total and the still-pending delta paint together for a frame.

const COALESCE_MS = 5_000;
const MAX_BACKOFF_MS = 10_000;

type OperationKind = "life" | "commander" | "status" | "undo";

interface Operation {
  opId: string;
  kind: OperationKind;
  key: string | null;
  path: string;
  method: "PATCH" | "POST";
  targetPlayerId: string | null;
  sourcePlayerId: string | null;
  delta: number;
  extra: Record<string, unknown>;
  readyAt: number;
  sent: boolean;
  confirmed: boolean;
  attempts: number;
}

export interface PendingOverlay {
  life: Record<string, number>;
  // keyed `${targetPlayerId}:${sourcePlayerId}`
  commander: Record<string, number>;
  // Concede / out changes not yet confirmed, latest last.
  status: Record<string, { conceded?: boolean; eliminated_override?: boolean | null }>;
}

interface Options<T extends SessionSnapshot> {
  // e.g. `/api/play/ABC123` or `/modules/damnation/api/sessions/<id>`
  baseUrl: string | null;
  headers?: Record<string, string>;
  acceptSnapshot: (snapshot: T) => void;
  snapshot: T | null;
  onError: (message: string) => void;
  // 401 / 410 from a write: the player was removed or the game ended.
  onAccessLost?: (status: number) => void;
}

export function useGameActions<T extends SessionSnapshot>({
  baseUrl,
  headers,
  acceptSnapshot,
  snapshot,
  onError,
  onAccessLost,
}: Options<T>) {
  // STATE
  const queueRef = useRef<Operation[]>([]);
  const [revision, setRevision] = useState(0);
  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const headersRef = useRef(headers);
  const callbacksRef = useRef({ acceptSnapshot, onError, onAccessLost });
  headersRef.current = headers;
  callbacksRef.current = { acceptSnapshot, onError, onAccessLost };

  const bump = () => setRevision((value) => value + 1);

  const pump = useCallback(async () => {
    if (runningRef.current || !baseUrl) return;
    runningRef.current = true;
    try {
      for (;;) {
        const head = queueRef.current[0];
        if (!head) break;
        const wait = head.readyAt - Date.now();
        if (wait > 0) {
          clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => void pump(), wait);
          break;
        }

        head.sent = true;
        const body =
          head.kind === "life"
            ? { op_id: head.opId, delta: head.delta }
            : head.kind === "commander"
              ? { op_id: head.opId, source_player_id: head.sourcePlayerId, delta: head.delta }
              : { op_id: head.opId, ...head.extra };

        let response: Response | null = null;
        try {
          response = await fetch(`${baseUrl}${head.path}`, {
            method: head.method,
            headers: { "content-type": "application/json", ...headersRef.current },
            body: JSON.stringify(body),
            cache: "no-store",
            // Lets a request started as the page is being closed still reach the server.
            keepalive: true,
          });
        } catch {
          response = null;
        }

        if (response && response.ok) {
          const data = await response.json().catch(() => null);
          queueRef.current.shift();
          if (data?.snapshot) callbacksRef.current.acceptSnapshot(data.snapshot as T);
          bump();
          continue;
        }

        const status = response?.status ?? 0;
        if (status === 401 || status === 410) {
          queueRef.current = [];
          bump();
          callbacksRef.current.onAccessLost?.(status);
          break;
        }
        if (status >= 400 && status < 500 && status !== 429) {
          // A definitive refusal (e.g. "Nothing to undo", player removed): drop it.
          const data = await response!.json().catch(() => null);
          queueRef.current.shift();
          bump();
          callbacksRef.current.onError(data?.error ?? "That change was refused");
          continue;
        }

        // Network failure, 5xx or 429: keep the op (same op_id) and retry with backoff.
        head.attempts += 1;
        head.readyAt = Date.now() + Math.min(MAX_BACKOFF_MS, 500 * 2 ** Math.min(head.attempts, 5));
        bump();
      }
    } finally {
      runningRef.current = false;
    }
  }, [baseUrl]);

  // Send everything now instead of waiting out the coalescing window or a retry backoff: when
  // the phone regains signal, and when the page is hidden or closed.
  useEffect(() => {
    const flush = () => {
      for (const operation of queueRef.current) operation.readyAt = Math.min(operation.readyAt, Date.now());
      void pump();
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("online", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
      clearTimeout(timerRef.current);
    };
  }, [pump]);

  const enqueueDelta = useCallback(
    (kind: "life" | "commander", targetPlayerId: string, sourcePlayerId: string | null, delta: number) => {
      const key = kind === "life" ? `life:${targetPlayerId}` : `cmdr:${targetPlayerId}:${sourcePlayerId}`;
      const tail = queueRef.current[queueRef.current.length - 1];
      // Only an unsent op at the END of the queue may absorb a tap, so ordering is preserved.
      if (tail && !tail.sent && tail.key === key && Math.abs(tail.delta + delta) <= MAX_DELTA && tail.delta + delta !== 0) {
        tail.delta += delta;
        tail.readyAt = Date.now() + COALESCE_MS;
      } else if (tail && !tail.sent && tail.key === key && tail.delta + delta === 0) {
        // +1 then −1 before sending: nothing to send at all.
        queueRef.current.pop();
      } else {
        queueRef.current.push({
          opId: generateUUID(),
          kind,
          key,
          path:
            kind === "life"
              ? `/players/${targetPlayerId}/life`
              : `/players/${targetPlayerId}/commander-damage`,
          method: "PATCH",
          targetPlayerId,
          sourcePlayerId,
          delta,
          extra: {},
          readyAt: Date.now() + COALESCE_MS,
          sent: false,
          confirmed: false,
          attempts: 0,
        });
      }
      bump();
      void pump();
    },
    [pump]
  );

  const changeLife = useCallback(
    (targetPlayerId: string, delta: number) => enqueueDelta("life", targetPlayerId, null, delta),
    [enqueueDelta]
  );

  const changeCommanderDamage = useCallback(
    (targetPlayerId: string, sourcePlayerId: string, delta: number) =>
      enqueueDelta("commander", targetPlayerId, sourcePlayerId, delta),
    [enqueueDelta]
  );

  const enqueueImmediate = useCallback(
    (kind: "status" | "undo", path: string, targetPlayerId: string | null, extra: Record<string, unknown>) => {
      // Taps still waiting out their coalescing window go first rather than holding this up.
      for (const operation of queueRef.current) operation.readyAt = Math.min(operation.readyAt, Date.now());
      queueRef.current.push({
        opId: generateUUID(),
        kind,
        key: null,
        path,
        method: kind === "status" ? "PATCH" : "POST",
        targetPlayerId,
        sourcePlayerId: null,
        delta: 0,
        extra,
        readyAt: Date.now(),
        sent: false,
        confirmed: false,
        attempts: 0,
      });
      bump();
      void pump();
    },
    [pump]
  );

  const changeStatus = useCallback(
    (targetPlayerId: string, change: { conceded?: boolean; eliminated_override?: boolean | null }) =>
      enqueueImmediate("status", `/players/${targetPlayerId}/status`, targetPlayerId, change),
    [enqueueImmediate]
  );

  // Waiting taps are sent first (enqueueImmediate), so undo acts on them.
  const undo = useCallback(() => enqueueImmediate("undo", "/undo", null, {}), [enqueueImmediate]);

  const overlay: PendingOverlay = useMemo(() => {
    const life: Record<string, number> = {};
    const commander: Record<string, number> = {};
    const status: PendingOverlay["status"] = {};
    // Ops already applied in the snapshot being rendered.
    const seen = new Set(snapshot?.events.map((event) => event.op_id) ?? []);
    for (const operation of queueRef.current) {
      if (operation.sent && seen.has(operation.opId)) operation.confirmed = true;
      if (operation.confirmed || !operation.targetPlayerId) continue;
      if (operation.kind === "life") {
        life[operation.targetPlayerId] = (life[operation.targetPlayerId] ?? 0) + operation.delta;
      } else if (operation.kind === "commander") {
        const key = `${operation.targetPlayerId}:${operation.sourcePlayerId}`;
        commander[key] = (commander[key] ?? 0) + operation.delta;
        life[operation.targetPlayerId] = (life[operation.targetPlayerId] ?? 0) - operation.delta;
      } else if (operation.kind === "status") {
        status[operation.targetPlayerId] = { ...status[operation.targetPlayerId], ...operation.extra };
      }
    }
    return { life, commander, status };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, snapshot]);

  const queued = queueRef.current.length;
  const retrying = queueRef.current.some((operation) => operation.attempts > 0);

  return { changeLife, changeCommanderDamage, changeStatus, undo, overlay, queued, retrying };
}
