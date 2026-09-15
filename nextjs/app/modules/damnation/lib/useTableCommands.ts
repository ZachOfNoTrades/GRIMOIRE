"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { generateUUID } from "@/lib/uuid";
import { PALETTE } from "./constants";
import {
  addPlayerPatch,
  editPlayerPatch,
  positionsPatch,
  removePlayerPatch,
  type SnapshotPatch,
} from "./optimisticPatches";
import type { SessionSnapshot } from "../types/damnation";

// Table controls that aren't counter taps — adding, renaming, recoloring, moving and removing
// players, plus whatever else the caller sends — for the host's board and for phones while the host
// lets guests manage players. The same player routes exist under both base URLs.
//
// Each command has its own op_id, and commands go out one at a time in the order they were made:
// the table shows each change at once, so someone can remove a player and add another before the
// removal has reached the server, and the add must not overtake it. With a patch, the change shows
// immediately and is dropped when the request settles — replaced by the server's snapshot on
// success, or rolled back with an error on failure (lib/optimisticPatches.ts).

type Method = "POST" | "PATCH" | "PUT";
type MoveTarget = { withPlayerId: string } | { toPosition: number };

export function useTableCommands<T extends SessionSnapshot>({
  baseUrl,
  headers,
  serverSnapshot,
  acceptSnapshot,
  onError,
  disabled = false,
}: {
  // null while there is nothing to send to yet (a phone still joining).
  baseUrl: string | null;
  headers?: Record<string, string>;
  serverSnapshot: T | null;
  acceptSnapshot: (snapshot: T) => void;
  onError: (message: string) => void;
  // Blocks starting a drag (e.g. while another host action is running).
  disabled?: boolean;
}) {
  // OPTIMISTIC CHANGES
  const [patches, setPatches] = useState<{ id: number; apply: SnapshotPatch }[]>([]);
  const patchIdRef = useRef(0);
  const snapshot = useMemo(
    () => (serverSnapshot ? patches.reduce((view, patch) => patch.apply(view), serverSnapshot) : null),
    [serverSnapshot, patches]
  );

  // DRAG STATE — the player being dragged and what they'd land on ("spot:N" for an open spot)
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);

  const commandQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const command = useCallback(
    (path: string, body: Record<string, unknown> = {}, method: Method = "POST", patch?: SnapshotPatch): Promise<boolean> => {
      if (!baseUrl) return Promise.resolve(false);
      const patchId = (patchIdRef.current += 1);
      if (patch) setPatches((current) => [...current, { id: patchId, apply: patch }]);
      const send = async () => {
        try {
          const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers: { "content-type": "application/json", ...headers },
            body: JSON.stringify({ op_id: generateUUID(), ...body }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error ?? "That didn't work");
          if (data.snapshot) acceptSnapshot(data.snapshot);
          return true;
        } catch (error) {
          onError(error instanceof Error ? error.message : "That didn't work");
          return false;
        } finally {
          if (patch) setPatches((current) => current.filter((entry) => entry.id !== patchId));
        }
      };
      const result = commandQueueRef.current.then(send);
      commandQueueRef.current = result;
      return result;
    },
    [baseUrl, headers, acceptSnapshot, onError]
  );

  // Adds a player without a phone as "Player N" with a color nobody has; they're renamed and
  // recolored by tapping the name or color on their card.
  function addPlaceholderPlayer(position: number) {
    if (!snapshot) return;
    const names = new Set(snapshot.players.map((player) => player.display_name.toLowerCase()));
    let number = snapshot.players.length + 1;
    while (names.has(`player ${number}`)) number += 1;
    const colors = new Set(snapshot.players.map((player) => player.color_key));
    const color = PALETTE.find((entry) => !colors.has(entry.key))?.key ?? PALETTE[0].key;
    const displayName = `Player ${number}`;
    const playerId = generateUUID().toLowerCase();
    command(
      "/players",
      { player_id: playerId, display_name: displayName, color_key: color, position },
      "POST",
      addPlayerPatch(playerId, displayName, color, position)
    );
  }

  const renamePlayer = (playerId: string, displayName: string) =>
    command(`/players/${playerId}`, { display_name: displayName }, "PATCH", editPlayerPatch(playerId, { display_name: displayName }));

  const recolorPlayer = (playerId: string, colorKey: string) =>
    void command(`/players/${playerId}`, { color_key: colorKey }, "PATCH", editPlayerPatch(playerId, { color_key: colorKey }));

  const removePlayer = (playerId: string) => command(`/players/${playerId}/kick`, {}, "POST", removePlayerPatch(playerId));

  // Moves a player: onto another player's spot (the two swap) or into an open spot.
  function movePlayer(playerId: string, target: MoveTarget) {
    const mover = snapshot?.players.find((player) => player.id === playerId);
    if (!snapshot || !mover) return;
    if ("toPosition" in target) {
      command(`/players/${playerId}/move`, { to_position: target.toPosition }, "POST", positionsPatch({ [playerId]: target.toPosition }));
      return;
    }
    const other = snapshot.players.find((player) => player.id === target.withPlayerId);
    if (!other) return;
    command(
      `/players/${playerId}/move`,
      { with_player_id: other.id },
      "POST",
      positionsPatch({ [playerId]: other.position, [other.id]: mover.position })
    );
  }

  // Drag a card by its grip and drop it on another card to swap the two players' places, or on an
  // open spot to move into it. What's under the pointer is found with elementFromPoint, so it works
  // across a 2-D layout.
  function startDrag(event: React.PointerEvent, playerId: string) {
    if (event.button !== 0 || disabled) return;
    event.preventDefault();
    setDragId(playerId);
    let target: string | null = null;

    const onMove = (move: PointerEvent) => {
      const under = document.elementFromPoint(move.clientX, move.clientY)?.closest<HTMLElement>("[data-player-id], [data-open-spot]");
      const next = !under
        ? null
        : under.dataset.openSpot
          ? `spot:${under.dataset.openSpot}`
          : under.dataset.playerId !== playerId ? under.dataset.playerId ?? null : null;
      if (next !== target) {
        target = next;
        setDropId(next);
      }
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cleanup);
      setDragId(null);
      setDropId(null);
    };
    const onUp = () => {
      const dropped = target;
      cleanup();
      if (!dropped) return;
      if (dropped.startsWith("spot:")) movePlayer(playerId, { toPosition: Number(dropped.slice(5)) });
      else movePlayer(playerId, { withPlayerId: dropped });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cleanup);
  }

  // Arrow keys on a card's grip: swap with the player before or after in seat order.
  function stepPlayer(playerId: string, step: -1 | 1) {
    if (!snapshot) return;
    const order = snapshot.players.findIndex((other) => other.id === playerId);
    const other = snapshot.players[order + step];
    if (other && !other.pending) movePlayer(playerId, { withPlayerId: other.id });
  }

  return { snapshot, command, addPlaceholderPlayer, renamePlayer, recolorPlayer, removePlayer, movePlayer, stepPlayer, startDrag, dragId, dropId };
}
