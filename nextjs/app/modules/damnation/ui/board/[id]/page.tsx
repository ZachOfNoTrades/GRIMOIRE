"use client";

import {
  ArrowLeft,
  DoorClosed,
  DoorOpen,
  Expand,
  RefreshCw,
  Shrink,
  Play,
  UserCog,
  UserPlus,
  Skull,
  Undo2,
  UserX,
  WifiOff,
} from "lucide-react";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import { BackLink } from "@/components/BackLink";
import ConfirmModal from "@/components/ConfirmModal";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { Button } from "@/components/ui/button";
import HelpButton from "@/components/ui/HelpButton";
import { generateUUID } from "@/lib/uuid";
import ActivityFeed from "../../../components/ActivityFeed";
import AddPlayerModal from "../../../components/AddPlayerModal";
import { HOST_HELP } from "../../../components/help";
import PlayerCard from "../../../components/PlayerCard";
import QrCode from "../../../components/QrCode";
import WikiSearch from "../../../components/WikiSearch";
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
  const [isEditing, setIsEditing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
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
  // The desktop controls every player's life at any time; the toggle only reveals player removal.
  const isManagingPlayers = isEditing && !isFinished;
  const openSpots = snapshot ? Math.max(0, snapshot.max_players - snapshot.players.length) : 0;
  const showJoinPanel = !!snapshot && !isFinished && (snapshot.status === "lobby" || snapshot.players.some((player) => player.rejoinable));

  useWakeLock(!!snapshot && !isFinished);
  useEntityTitle(snapshot?.join_code ? `Board ${snapshot.join_code}` : null);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === boardRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Host controls that aren't counter taps: sent straight away, each with its own op_id.
  const hostCommand = useCallback(
    async (path: string, body: Record<string, unknown> = {}) => {
      setIsBusy(true);
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method: "POST",
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

            {/* UNDO LAST (any player) */}
            {!isFinished && (
              <Button className="btn-link" onClick={actions.undo} disabled={!snapshot} title="Undo the latest change at the table" aria-label="Undo the latest change at the table">
                <Undo2 className="w-5 h-5" />
              </Button>
            )}

            {/* CORRECTIONS TOGGLE */}
            {!isFinished && (
              <Button
                className={isEditing ? "btn-blue" : "btn-link"}
                onClick={() => setIsEditing((value) => !value)}
                aria-pressed={isEditing}
                title="Manage players: remove a player"
                aria-label="Manage players"
              >
                <UserCog className="w-5 h-5" />
              </Button>
            )}

            {/* FULL SCREEN */}
            <Button className="btn-link" onClick={toggleFullscreen} title={isFullscreen ? "Exit full screen" : "Full screen"} aria-label={isFullscreen ? "Exit full screen" : "Full screen"}>
              {isFullscreen ? <Shrink className="w-5 h-5" /> : <Expand className="w-5 h-5" />}
            </Button>

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

              {/* JOIN PANEL */}
              {showJoinPanel && snapshot.join_url && snapshot.join_code && (
                <div className="card">
                  <div className="dmn-join">

                    {/* QR CODE */}
                    <QrCode value={snapshot.join_url} label={`QR code to join game ${snapshot.join_code}`} />

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
                  </div>
                </div>
              )}

              {/* PLAYERS GRID */}
              <div className="dmn-grid">
                {snapshot.players.map((player) => (
                  <div key={player.id} className="flex flex-col gap-1 min-w-0">

                    {/* PLAYER CARD */}
                    <PlayerCard
                      player={player}
                      players={snapshot.players}
                      cells={snapshot.commander_damage}
                      overlay={actions.overlay}
                      variant="board"
                      editable={!isFinished}
                      connected={player.rejoinable || player.manual ? null : connected.has(player.id)}
                      onLife={(delta) => actions.changeLife(player.id, delta)}
                      onCommander={(sourceId, delta) => actions.changeCommanderDamage(player.id, sourceId, delta)}
                      onStatus={(change) => actions.changeStatus(player.id, change)}
                    />

                    {/* PLAYER MANAGEMENT */}
                    {isManagingPlayers && (
                      <div className="flex gap-1">
                        <Button className="btn-off flex-1" disabled={isBusy} onClick={() => setConfirm({ kind: "kick", playerId: player.id, name: player.display_name })} title="Remove this player from the game">
                          <UserX className="w-4 h-4" /> Remove
                        </Button>
                      </div>
                    )}
                  </div>
                ))}

                {/* OPEN SPOTS — waiting text, with a way to add someone who has no phone underneath */}
                {!isFinished && Array.from({ length: openSpots }, (_, index) => (
                  <div key={`empty-${index}`} className="dmn-empty-seat">

                    {/* WAITING TEXT */}
                    <span>{snapshot.status === "lobby" ? "Waiting for a player…" : "Open spot"}</span>

                    {/* ADD PLAYER */}
                    <button
                      type="button"
                      className="dmn-add-player"
                      disabled={isBusy}
                      onClick={() => setShowAddPlayer(true)}
                      title="Add a player who has no phone"
                    >
                      <UserPlus className="w-4 h-4" aria-hidden /> Add player
                    </button>
                  </div>
                ))}

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

            {/* ACTIVITY COLUMN */}
            <div className="card">
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
                ? `${confirm.name} is removed from the game and their phone is signed out.`
                : ""
          }
        />

        {/* ADD PLAYER MODAL */}
        <AddPlayerModal
          isOpen={showAddPlayer}
          takenColors={snapshot?.players.map((player) => player.color_key) ?? []}
          isSaving={isBusy}
          onCancel={() => setShowAddPlayer(false)}
          onAdd={async (displayName, colorKey) => {
            if (await hostCommand("/players", { display_name: displayName, color_key: colorKey })) setShowAddPlayer(false);
          }}
        />
      </div>
    </div>
  );
}
