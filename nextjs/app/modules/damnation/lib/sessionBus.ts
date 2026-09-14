import type { HostSnapshot, StreamEvent } from "../types/damnation";

// In-process fan-out of session updates to open SSE streams.
//
// Lives on globalThis: under `next dev` the guest routes (app/api/damnation/…) and the host routes
// (app/modules/damnation/api/…) compile into separate bundles, and a plain module-level Map
// would give each its own copy — a guest's write would never reach the board's stream.
// A single in-memory bus is correct because grimoire runs as one PM2 fork-mode process.

export interface Subscriber {
  id: number;
  sessionId: string;
  // null = a host board stream
  playerId: string | null;
  openedAt: number;
  sendSnapshot: (snapshot: HostSnapshot) => void;
  sendEvent: (event: StreamEvent) => void;
  close: () => void;
}

interface BusState {
  sessions: Map<string, Set<Subscriber>>;
  total: number;
  nextId: number;
}

const globalBus = globalThis as typeof globalThis & { __damnationBus?: BusState };

if (!globalBus.__damnationBus) {
  globalBus.__damnationBus = { sessions: new Map(), total: 0, nextId: 1 };
}
const bus = globalBus.__damnationBus;

// One process serves every Grimoire module, so public streams are capped: an unbounded
// number of open connections would starve the rest of the app.
export const GLOBAL_STREAM_CAP = 150;
const STREAMS_PER_PLAYER = 2;
const HOST_STREAMS_PER_SESSION = 4;

export function nextSubscriberId(): number {
  return bus.nextId++;
}

function remove(subscriber: Subscriber): boolean {
  const set = bus.sessions.get(subscriber.sessionId);
  if (!set || !set.delete(subscriber)) return false;
  bus.total -= 1;
  if (set.size === 0) bus.sessions.delete(subscriber.sessionId);
  return true;
}

// Registers a stream. Returns an unsubscribe function, or null when a cap is reached.
// A player may hold STREAMS_PER_PLAYER streams (two tabs); a third evicts their oldest,
// which also clears zombie connections left behind by a phone that dropped off Wi-Fi.
export function subscribe(subscriber: Subscriber): (() => void) | null {
  let set = bus.sessions.get(subscriber.sessionId);
  if (!set) {
    set = new Set();
    bus.sessions.set(subscriber.sessionId, set);
  }

  const same = [...set].filter((existing) => existing.playerId === subscriber.playerId);
  const perIdentityCap = subscriber.playerId === null ? HOST_STREAMS_PER_SESSION : STREAMS_PER_PLAYER;
  if (same.length >= perIdentityCap) {
    const oldest = same.sort((a, b) => a.openedAt - b.openedAt)[0];
    remove(oldest);
    oldest.close();
  }

  if (bus.total >= GLOBAL_STREAM_CAP) {
    if (set.size === 0) bus.sessions.delete(subscriber.sessionId);
    return null;
  }

  set.add(subscriber);
  bus.total += 1;
  broadcastPresence(subscriber.sessionId);

  return () => {
    if (remove(subscriber)) broadcastPresence(subscriber.sessionId);
  };
}

export function broadcastSnapshot(sessionId: string, snapshot: HostSnapshot): void {
  const set = bus.sessions.get(sessionId);
  if (!set) return;
  for (const subscriber of [...set]) subscriber.sendSnapshot(snapshot);
}

export function presenceFor(sessionId: string): { connected_player_ids: string[]; host_connected: boolean } {
  const set = bus.sessions.get(sessionId) ?? new Set<Subscriber>();
  const playerIds = new Set<string>();
  let hostConnected = false;
  for (const subscriber of set) {
    if (subscriber.playerId === null) hostConnected = true;
    else playerIds.add(subscriber.playerId);
  }
  return { connected_player_ids: [...playerIds], host_connected: hostConnected };
}

function broadcastPresence(sessionId: string): void {
  const set = bus.sessions.get(sessionId);
  if (!set) return;
  const event: StreamEvent = { type: "presence", data: presenceFor(sessionId) };
  for (const subscriber of [...set]) subscriber.sendEvent(event);
}

// Closes every stream for a deleted game: phones are told the game ended, and boards reconnect to
// find it gone.
export function closeSession(sessionId: string): void {
  const set = bus.sessions.get(sessionId);
  if (!set) return;
  for (const subscriber of [...set]) {
    if (subscriber.playerId !== null) subscriber.sendEvent({ type: "revoked", data: { reason: "ended" } });
    remove(subscriber);
    subscriber.close();
  }
}

// Ends a player's streams after they are removed or leave, so a revoked
// token stops receiving updates immediately instead of at its next request.
export function revokePlayer(sessionId: string, playerId: string, reason: "kicked"): void {
  const set = bus.sessions.get(sessionId);
  if (!set) return;
  for (const subscriber of [...set]) {
    if (subscriber.playerId !== playerId) continue;
    subscriber.sendEvent({ type: "revoked", data: { reason } });
    remove(subscriber);
    subscriber.close();
  }
  broadcastPresence(sessionId);
}

export function endSession(sessionId: string, finalSnapshot: HostSnapshot): void {
  const set = bus.sessions.get(sessionId);
  if (!set) return;
  for (const subscriber of [...set]) {
    subscriber.sendSnapshot(finalSnapshot);
    if (subscriber.playerId !== null) {
      subscriber.sendEvent({ type: "revoked", data: { reason: "ended" } });
      remove(subscriber);
      subscriber.close();
    }
  }
}
