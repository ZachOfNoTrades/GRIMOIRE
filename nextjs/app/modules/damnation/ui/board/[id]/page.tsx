"use client";

import {
  ArrowLeft,
  LayoutGrid,
  DoorClosed,
  DoorOpen,
  Expand,
  RefreshCw,
  Shrink,
  Play,
  Settings,
  Skull,
  Undo2,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { BackLink } from "@/components/BackLink";
import ConfirmModal from "@/components/ConfirmModal";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { Button } from "@/components/ui/button";
import HelpButton from "@/components/ui/HelpButton";
import { generateUUID } from "@/lib/uuid";
import ActivityFeed from "../../../components/ActivityFeed";
import GameSetup from "../../../components/GameSetup";
import LayoutPicker from "../../../components/LayoutPicker";
import OpenSpotTile from "../../../components/OpenSpotTile";
import { HOST_HELP } from "../../../components/help";
import PlayerCard from "../../../components/PlayerCard";
import QrCode from "../../../components/QrCode";
import WikiSearch from "../../../components/WikiSearch";
import { arrangeSpots, findLayout, SLOT_NAMES } from "../../../lib/boardLayouts";
import { PALETTE } from "../../../lib/constants";
import { useGameActions } from "../../../lib/useGameActions";
import { useSessionStream } from "../../../lib/useSessionStream";
import { useWakeLock } from "../../../lib/useWakeLock";
import type { HostSnapshot } from "../../../types/damnation";

type PendingConfirm =
  | { kind: "end" }
  | { kind: "kick"; playerId: string; name: string };

export default function DamnationBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const baseUrl = `/modules/damnation/api/sessions/${id}`;

  // STATE
  const [notFound, setNotFound] = useState(false);
  // DRAG — the player being dragged, and where they'd land if released now: another player's id
  // (swap) or "spot:<n>" for an open spot.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [showLayoutPicker, setShowLayoutPicker] = useState(false);
  const [isWide, setIsWide] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  const { snapshot, presence, connection, acceptSnapshot } = useSessionStream<HostSnapshot>({
    url: `${baseUrl}/stream`,
    onRevoked: (reason) => {
      if (reason === "not_found" || reason === "unauthorized") setNotFound(true);
    },
  });

  const actions = useGameActions<HostSnapshot>({
    baseUrl,
    acceptSnapshot,
    snapshot,
    onError: (message) => toast.error(message),
  });

  const isFinished = snapshot?.status === "finished";
  const connected = new Set(presence?.connected_player_ids ?? []);
  // Board positions in order; null is an open spot. Players keep their position when someone leaves.
  const spots = snapshot ? arrangeSpots(snapshot.players, snapshot.max_players) : [];
  const showJoinPanel = !!snapshot && !isFinished && (snapshot.status === "lobby" || snapshot.players.some((player) => player.rejoinable));

  // A fixed table layout only fits when the board has its full width (the activity column sits
  // beside it from 1024px); narrower screens keep the automatic grid.
  const layout = isWide ? findLayout(snapshot?.board_layout, snapshot?.max_players ?? 0) : null;
  // Without a table layout, a wide board picks its column count from the number of spots so
  // every row fills (2 across for 2 or 4, 3 across otherwise) and the board fits a square screen.
  const autoColumns = snapshot && snapshot.max_players !== 2 && snapshot.max_players !== 4 ? 3 : 2;
  const gridStyle = layout
    ? { gridTemplateColumns: layout.columns, gridTemplateAreas: layout.areas.map((row) => `"${row}"`).join(" ") }
    : isWide
      ? { gridTemplateColumns: `repeat(${autoColumns}, minmax(0, 1fr))` }
      : undefined;
  const slotStyle = (index: number) => (layout ? { gridArea: SLOT_NAMES[index] } : undefined);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useWakeLock(!!snapshot && !isFinished);
  useEntityTitle(snapshot?.join_code ? `Board ${snapshot.join_code}` : null);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === boardRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Host controls that aren't counter taps: sent straight away, each with its own op_id.
  const hostCommand = useCallback(
    async (path: string, body: Record<string, unknown> = {}, method: "POST" | "PATCH" = "POST") => {
      setIsBusy(true);
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ op_id: generateUUID(), ...body }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "That didn't work");
        if (data.snapshot) acceptSnapshot(data.snapshot);
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That didn't work");
        return false;
      } finally {
        setIsBusy(false);
      }
    },
    [baseUrl, acceptSnapshot]
  );

  // Adds a player without a phone as "Player N" with a color nobody has; the host renames and
  // recolors them by clicking the name or color on their card.
  function addPlaceholderPlayer(position: number) {
    if (!snapshot) return;
    const names = new Set(snapshot.players.map((player) => player.display_name.toLowerCase()));
    let number = snapshot.players.length + 1;
    while (names.has(`player ${number}`)) number += 1;
    const colors = new Set(snapshot.players.map((player) => player.color_key));
    const color = PALETTE.find((entry) => !colors.has(entry.key))?.key ?? PALETTE[0].key;
    hostCommand("/players", { display_name: `Player ${number}`, color_key: color, position });
  }

  async function saveLayout(layoutKey: string | null) {
    setIsBusy(true);
    try {
      const response = await fetch(`${baseUrl}/layout`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ board_layout: layoutKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Couldn't change the layout");
      if (data.snapshot) acceptSnapshot(data.snapshot);
      setShowLayoutPicker(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't change the layout");
    } finally {
      setIsBusy(false);
    }
  }

  // Drag a card by its grip and drop it on another card to swap the two players' places, or on an
  // open spot to move into it. What's under the pointer is found with elementFromPoint, so it works
  // across a 2-D layout.
  function startDrag(event: React.PointerEvent, playerId: string) {
    if (event.button !== 0 || isBusy) return;
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
      if (dropped.startsWith("spot:")) hostCommand(`/players/${playerId}/move`, { to_position: Number(dropped.slice(5)) });
      else hostCommand(`/players/${playerId}/move`, { with_player_id: dropped });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cleanup);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await boardRef.current?.requestFullscreen();
    } catch {
      toast.error("Full screen isn't available here");
    }
  }

  async function runConfirmed() {
    const pending = confirm;
    setConfirm(null);
    if (!pending) return;
    if (pending.kind === "end") await hostCommand("/end");
    if (pending.kind === "kick") await hostCommand(`/players/${pending.playerId}/kick`);
  }

  if (notFound) {
    return (
      <div className="page">
        <div className="page-container">

          {/* BACK LINK */}
          <BackLink className="btn btn-link mb-4 !pl-0" fallback="/modules/damnation/ui/home">
            <ArrowLeft className="w-5 h-5" /> Damnation
          </BackLink>

          {/* NOT FOUND STATE */}
          <div className="alert-red">
            <p className="alert-title">Game not found</p>
            <p className="alert-text">This game doesn&apos;t exist or isn&apos;t yours.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div ref={boardRef} className="dmn-board page-container">
        <Toaster position="top-center" />

        {/* HEADER ROW */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">

          {/* BACK TO DAMNATION HOME */}
          <BackLink className="btn btn-link !pl-0" fallback="/modules/damnation/ui/home" aria-label="Back to Damnation">
            <ArrowLeft className="w-5 h-5" />
          </BackLink>

          {/* BOARD ACTIONS */}
          <div className="flex flex-wrap items-center gap-1">

            {/* WIKI */}
            {snapshot && <WikiSearch template={snapshot.wiki_search_template} embed={snapshot.wiki_embed} className="btn-link" />}

            {/* TABLE LAYOUT */}
            <Button className="btn-link" onClick={() => setShowLayoutPicker(true)} disabled={!snapshot} title="Table layout: arrange the board like the table" aria-label="Table layout">
              <LayoutGrid className="w-5 h-5" />
            </Button>

            {/* UNDO LAST (any player) */}
            {!isFinished && (
              <Button className="btn-link" onClick={actions.undo} disabled={!snapshot} title="Undo the latest change at the table" aria-label="Undo the latest change at the table">
                <Undo2 className="w-5 h-5" />
              </Button>
            )}

            {/* FULL SCREEN */}
            <Button className="btn-link" onClick={toggleFullscreen} title={isFullscreen ? "Exit full screen" : "Full screen"} aria-label={isFullscreen ? "Exit full screen" : "Full screen"}>
              {isFullscreen ? <Shrink className="w-5 h-5" /> : <Expand className="w-5 h-5" />}
            </Button>

            {/* SETTINGS */}
            <Link className="btn btn-link" href="/modules/damnation/ui/settings" aria-label="Damnation settings" title="Settings">
              <Settings className="w-5 h-5" />
            </Link>

            {/* HELP */}
            <HelpButton title="Damnation" sections={HOST_HELP} />
          </div>
        </div>

        {/* CONNECTION BANNER */}
        {snapshot && connection !== "live" && !isFinished && (
          <div className="dmn-connection mb-3" role="status">
            <WifiOff className="w-4 h-4" aria-hidden /> Reconnecting — the board will catch up
          </div>
        )}

        {/* LOADING PLACEHOLDER */}
        {!snapshot && <p className="text-secondary">Loading board…</p>}

        {snapshot && (
          <div className="dmn-board-layout">

            {/* MAIN COLUMN */}
            <div className="flex flex-col gap-4 min-w-0">

              {/* FINISHED BANNER */}
              {isFinished && (
                <div className="alert-blue">
                  <p className="alert-title"><Skull className="w-4 h-4" /> Game over</p>
                  <p className="alert-text">Final totals are shown below. Resume to keep playing from here with a new code.</p>

                  {/* RESUME */}
                  <Button className="btn-green mt-2 self-start" disabled={isBusy} onClick={() => hostCommand("/resume")} title="Reopen this game with its totals and a new join code">
                    <Play className="w-4 h-4" /> Resume game
                  </Button>
                </div>
              )}

              {/* JOIN PANEL — QR on the left; the code, and while joining is open the game setup, beside it */}
              {showJoinPanel && snapshot.join_url && snapshot.join_code && (
                <div className="card">
                  <div className="dmn-join">

                    {/* QR CODE */}
                    <QrCode value={snapshot.join_url} label={`QR code to join game ${snapshot.join_code}`} />

                    {/* JOIN BODY */}
                    <div className="dmn-join-body">

                      {/* JOIN TEXT */}
                      <div className="flex flex-col gap-2 min-w-0">
                        <span className="text-secondary">Scan, or go to <strong>{snapshot.join_url.replace("https://", "").replace(`/${snapshot.join_code}`, "")}</strong> and enter</span>
                        <span className="dmn-code" aria-label={`Join code ${snapshot.join_code.split("").join(" ")}`}>{snapshot.join_code}</span>
                        <span className="text-secondary">
                          {snapshot.status === "lobby"
                            ? `${snapshot.players.length}/${snapshot.max_players} players`
                            : "Joining is closed — players rejoin with the code"}
                        </span>
                      </div>

                      {/* GAME SETUP — while joining is open */}
                      {snapshot.status === "lobby" && (
                        <GameSetup
                          startingLife={snapshot.starting_life}
                          maxPlayers={snapshot.max_players}
                          playerCount={snapshot.players.length}
                          disabled={isBusy}
                          onChange={(change) => hostCommand("/setup", change)}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* PLAYERS GRID */}
              <div className="dmn-grid" style={gridStyle}>
                {spots.map((player, index) =>
                  player ? (
                    <div
                      key={player.id}
                      data-player-id={player.id}
                      className={`flex flex-col min-w-0 ${dragId === player.id ? "dmn-dragging" : ""} ${dropId === player.id ? "dmn-drop-target" : ""}`}
                      style={slotStyle(index)}
                    >

                      {/* PLAYER CARD */}
                      <PlayerCard
                        player={player}
                        players={snapshot.players}
                        cells={snapshot.commander_damage}
                        commanderDamage={snapshot.commander_damage_enabled}
                        overlay={actions.overlay}
                        variant="board"
                        editable={!isFinished}
                        connected={player.rejoinable || player.manual ? null : connected.has(player.id)}
                        onLife={(delta) => actions.changeLife(player.id, delta)}
                        onCommander={(sourceId, delta) => actions.changeCommanderDamage(player.id, sourceId, delta)}
                        onStatus={(change) => actions.changeStatus(player.id, change)}
                        onRemove={isFinished ? undefined : () => setConfirm({ kind: "kick", playerId: player.id, name: player.display_name })}
                        removeDisabled={isBusy}
                        onRename={isFinished ? undefined : (displayName) => hostCommand(`/players/${player.id}`, { display_name: displayName }, "PATCH")}
                        onRecolor={isFinished ? undefined : (colorKey) => void hostCommand(`/players/${player.id}`, { color_key: colorKey }, "PATCH")}
                        onGripPointerDown={isFinished ? undefined : (event) => startDrag(event, player.id)}
                        onGripKey={(step) => {
                          const order = snapshot.players.findIndex((other) => other.id === player.id);
                          const other = snapshot.players[order + step];
                          if (other && !isBusy) hostCommand(`/players/${player.id}/move`, { with_player_id: other.id });
                        }}
                        fill={layout !== null}
                      />
                    </div>
                  ) : isFinished ? null : (
                    /* OPEN SPOT — a position nobody holds, with a button to add someone who has no phone */
                    <OpenSpotTile
                      key={`empty-${index}`}
                      position={index + 1}
                      isDropTarget={dropId === `spot:${index + 1}`}
                      style={slotStyle(index)}
                      waitingText={snapshot.status === "lobby" ? "Waiting for a player…" : "Open spot"}
                      disabled={isBusy}
                      onAdd={() => addPlaceholderPlayer(index + 1)}
                    />
                  )
                )}

                {/* NO PLAYERS PLACEHOLDER */}
                {snapshot.players.length === 0 && isFinished && (
                  <div className="dmn-empty-seat">Nobody joined this game.</div>
                )}
              </div>

              {/* GAME CONTROLS */}
              {!isFinished && (
                <div className="flex flex-wrap gap-2">
                  {snapshot.status === "lobby" ? (
                    <Button className="btn-green" disabled={isBusy || snapshot.players.length === 0} onClick={() => hostCommand("/joins", { open: false })} title="Close joining and start playing">
                      <DoorClosed className="w-4 h-4" /> Start game
                    </Button>
                  ) : (
                    <Button className="btn-off" disabled={isBusy} onClick={() => hostCommand("/joins", { open: true })} title="Let a late arrival join">
                      <DoorOpen className="w-4 h-4" /> Reopen joining
                    </Button>
                  )}
                  <Button className="btn-off" disabled={isBusy} onClick={() => hostCommand("/rotate-code")} title="Retire this code; players already in keep playing">
                    <RefreshCw className="w-4 h-4" /> New code
                  </Button>
                  <Button className="btn-red" disabled={isBusy} onClick={() => setConfirm({ kind: "end" })}>
                    <Skull className="w-4 h-4" /> End game
                  </Button>
                </div>
              )}
            </div>

            {/* ACTIVITY COLUMN — as tall as the board beside it on wide screens (globals.css) */}
            <div className="card dmn-activity">
              <div className="card-header">
                <h2 className="text-card-title">Activity</h2>
              </div>
              <ActivityFeed events={snapshot.events} players={snapshot.players} formerPlayers={snapshot.former_players} />
            </div>
          </div>
        )}

        {/* CONFIRM MODAL */}
        <ConfirmModal
          isOpen={confirm !== null}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirmed}
          danger
          title={confirm?.kind === "end" ? "End this game?" : "Remove player?"}
          confirmLabel={confirm?.kind === "end" ? "End game" : "Remove"}
          message={
            confirm?.kind === "end"
              ? "Every phone is signed out and the code stops working. Final totals stay on this board."
              : confirm
                ? `${confirm.name} is removed from the game.`
                : ""
          }
        />

        {/* TABLE LAYOUT MODAL */}
        {snapshot && (
          <LayoutPicker
            isOpen={showLayoutPicker}
            playerCount={snapshot.max_players}
            current={snapshot.board_layout}
            isSaving={isBusy}
            onCancel={() => setShowLayoutPicker(false)}
            onPick={saveLayout}
          />
        )}
      </div>
    </div>
  );
}
