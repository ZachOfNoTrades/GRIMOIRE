import type { HostSnapshot, SessionSnapshot, StreamEvent } from "../types/damnation";
import { nextSubscriberId, subscribe, type Subscriber } from "./sessionBus";

const HEARTBEAT_MS = 20_000;
const RECONNECT_MS = 3_000;

// Opens a Server-Sent Events response for one session. The initial snapshot is read by the
// caller before this runs, so no database connection is held for the life of the stream.
export function openSessionStream(options: {
  request: Request;
  sessionId: string;
  playerId: string | null;
  initial: HostSnapshot;
  decorate: (snapshot: HostSnapshot) => SessionSnapshot;
}): Response {
  const { request, sessionId, playerId, initial, decorate } = options;
  const encoder = new TextEncoder();

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | null = null;
  let closed = false;
  let rejected = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // One dead or closed phone must never abort a broadcast to everyone else, so every
      // write is guarded and a failed write tears this stream down.
      const write = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          shutdown();
        }
      };

      const shutdown = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const subscriber: Subscriber = {
        id: nextSubscriberId(),
        sessionId,
        playerId,
        openedAt: Date.now(),
        sendSnapshot: (snapshot) =>
          write(`event: snapshot\nid: ${snapshot.version}\ndata: ${JSON.stringify(decorate(snapshot))}\n\n`),
        sendEvent: (event: StreamEvent) => write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`),
        close: shutdown,
      };

      unsubscribe = subscribe(subscriber);
      if (!unsubscribe) {
        rejected = true;
        closed = true;
        return;
      }

      write(`retry: ${RECONNECT_MS}\n\n`);
      subscriber.sendSnapshot(initial);

      // Comment lines keep the tunnel and any proxy from closing an idle stream.
      heartbeat = setInterval(() => write(`: ping\n\n`), HEARTBEAT_MS);
      request.signal.addEventListener("abort", shutdown);
    },
    cancel() {
      closed = true;
      clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  // ReadableStream runs start() synchronously, so a refused subscription is known here and
  // can be answered with a real 429 instead of an open-then-closed stream.
  if (rejected) {
    stream.cancel().catch(() => {});
    return new Response(JSON.stringify({ error: "Too many live connections — try again shortly" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "10" },
    });
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
