"use client";

import {
  ArrowLeft,
  BookOpen,
  EllipsisVertical,
  HelpCircle,
  LayoutGrid,
  Expand,
  Shrink,
  Settings,
  Skull,
  RotateCcw,
  Trash2,
  WifiOff,
} from "lucide-react";
import PopoverMenu from "@/components/PopoverMenu";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "@/components/Toaster";
import { BackLink } from "@/components/BackLink";
import ConfirmModal from "@/components/ConfirmModal";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { Button } from "@/components/ui/button";
import HelpButton from "@/components/ui/HelpButton";
import GameCard from "../../../components/GameCard";
import LayoutPicker from "../../../components/LayoutPicker";
import OpenSpotTile from "../../../components/OpenSpotTile";
import { HOST_HELP } from "../../../components/help";
import PlayerCard from "../../../components/PlayerCard";
import WikiSearch from "../../../components/WikiSearch";
import { arrangeSpots, resolveLayout, SLOT_NAMES } from "../../../lib/boardLayouts";
import {
  commanderDamagePatch,
  guestManagementPatch,
  joiningPatch,
  placeholderPlayer,
  layoutPatch,
  resetPatch,
  setupPatch,
} from "../../../lib/optimisticPatches";
import { useGameActions } from "../../../lib/useGameActions";
import { useSessionStream } from "../../../lib/useSessionStream";
import { useTableCommands } from "../../../lib/useTableCommands";
import { useWakeLock } from "../../../lib/useWakeLock";
import type { HostSnapshot } from "../../../types/damnation";

type PendingConfirm =
  | { kind: "delete" }
  | { kind: "reset" }
  | { kind: "kick"; playerId: string; name: string };

export default function DamnationBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const baseUrl = `/modules/damnation/api/sessions/${id}`;

  // STATE
  const [notFound, setNotFound] = useState(false);
  // DRAG — the player being dragged, and where they'd land if released now: another player's id
  // (swap) or "spot:<n>" for an open spot.
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [showLayoutPicker, setShowLayoutPicker] = useState(false);
  // At most one card's Commander damage / Status section is open, so opening one never stacks
  // extra height onto the board.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showWiki, setShowWiki] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Game Setup on the side card, while the game is under way: shows the setup face instead of the activity.
  const [isEditingGame, setIsEditingGame] = useState(false);
  const menuButtonRef = useRef<HTMLSpanElement>(null);
  const [isBusy, setIsBusy] = useState(false);

  const { snapshot: serverSnapshot, connection, acceptSnapshot } = useSessionStream<HostSnapshot>({
    url: `${baseUrl}/stream`,
    onRevoked: (reason) => {
      if (reason === "not_found" || reason === "unauthorized") setNotFound(true);
    },
  });

  const actions = useGameActions<HostSnapshot>({
    baseUrl,
    acceptSnapshot,
    snapshot: serverSnapshot,
    onError: (message) => toast.error(message),
  });

  // TABLE COMMANDS — host controls that aren't counter taps, shown on the board at once and sent in
  // order (lib/useTableCommands.ts).
  const table = useTableCommands<HostSnapshot>({
    baseUrl,
    serverSnapshot,
    acceptSnapshot,
    onError: (message) => toast.error(message),
    disabled: isBusy,
  });
  const { snapshot, command: hostCommand, dragId, dropId } = table;

  const isFinished = snapshot?.status === "finished";
  // Board positions in order; null is an open spot. Players keep their position when someone leaves.
  const spots = snapshot ? arrangeSpots(snapshot.players, snapshot.max_players) : [];
  // The side card shows the setup before the game starts (and from Game Setup), the activity after.
  const showSetup = snapshot?.status === "lobby" || (snapshot?.status === "active" && isEditingGame);

  // Every game has a table layout, and it applies at every width, phones included.
  const layout = snapshot ? resolveLayout(snapshot.board_layout, snapshot.max_players) : null;
  // --dmn-rows lets a wide board split its height evenly between the layout's rows (globals.css).
  const gridStyle = layout
    ? ({
        gridTemplateColumns: layout.columns,
        gridTemplateAreas: layout.areas.map((row) => `"${row}"`).join(" "),
        "--dmn-rows": layout.areas.length,
      } as React.CSSProperties)
    : undefined;
  const slotStyle = (index: number) => (layout ? { gridArea: SLOT_NAMES[index] } : undefined);

  useWakeLock(!!snapshot && !isFinished);
  // The tab reads "Damnation · Life Tracker"; the join code stays off it.
  useEntityTitle("Life Tracker");

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function saveLayout(layoutKey: string) {
    setShowLayoutPicker(false);
    hostCommand("/layout", { board_layout: layoutKey }, "PUT", layoutPatch(layoutKey));
  }

  async function deleteGame() {
    setIsBusy(true);
    try {
      const response = await fetch(baseUrl, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Couldn't delete the game");
      router.push("/modules/damnation/ui/home");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the game");
      setIsBusy(false);
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      // The whole page, not just the board: menus and modals render in portals on <body>, which
      // a full-screen board element would hide.
      else await document.documentElement.requestFullscreen();
    } catch {
      toast.error("Full screen isn't available here");
    }
  }

  async function runConfirmed() {
    const pending = confirm;
    setConfirm(null);
    if (!pending) return;
    if (pending.kind === "delete") await deleteGame();
    if (pending.kind === "reset") await hostCommand("/reset", {}, "POST", resetPatch());
    if (pending.kind === "kick") await table.removePlayer(pending.playerId);
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
      <div className="dmn-board page-container">
        <Toaster position="top-center" />

        {/* HEADER ROW — kept short so the board gets the height */}
        <div className="dmn-board-header flex flex-wrap items-center justify-between gap-2 mb-2">

          {/* BACK TO DAMNATION HOME */}
          <BackLink className="btn btn-link !pl-0" fallback="/modules/damnation/ui/home" aria-label="Back to Damnation">
            <ArrowLeft className="w-5 h-5" />
          </BackLink>

          {/* BOARD MENU — every board action except the table layout, which sits with the game setup */}
          <div className="flex items-center">
            <span ref={menuButtonRef}>
              <Button className="btn-link" onClick={() => setIsMenuOpen((open) => !open)} disabled={!snapshot} title="More" aria-label="More actions" aria-expanded={isMenuOpen}>
                <EllipsisVertical className="w-5 h-5" />
              </Button>
            </span>
          </div>
        </div>

        {/* MENU POPOVER */}
        <PopoverMenu open={isMenuOpen} onClose={() => setIsMenuOpen(false)} anchorRef={menuButtonRef} className="popover-menu--wide">

          {/* WIKI ITEM */}
          <button className="popover-item" onClick={() => { setIsMenuOpen(false); setShowWiki(true); }}>
            <BookOpen className="w-4 h-4 mr-3" /> Wiki
          </button>

          {/* TABLE LAYOUT ITEM — only while the game setup (and its layout button) is hidden */}
          {snapshot?.status !== "lobby" && (
            <button className="popover-item" onClick={() => { setIsMenuOpen(false); setShowLayoutPicker(true); }}>
              <LayoutGrid className="w-4 h-4 mr-3" /> Table layout
            </button>
          )}

          {/* FULL SCREEN ITEM */}
          <button className="popover-item" onClick={() => { setIsMenuOpen(false); toggleFullscreen(); }}>
            {isFullscreen ? <Shrink className="w-4 h-4 mr-3" /> : <Expand className="w-4 h-4 mr-3" />}
            {isFullscreen ? "Exit full screen" : "Full screen"}
          </button>

          {/* SETTINGS ITEM */}
          <button className="popover-item" onClick={() => { setIsMenuOpen(false); router.push("/modules/damnation/ui/settings"); }}>
            <Settings className="w-4 h-4 mr-3" /> Settings
          </button>

          {/* HELP ITEM */}
          <button className="popover-item" onClick={() => { setIsMenuOpen(false); setShowHelp(true); }}>
            <HelpCircle className="w-4 h-4 mr-3" /> Help
          </button>

          {/* RESET ITEM — same players and settings, everyone back to the starting life */}
          {snapshot?.status !== "finished" && (
            <button className="popover-item" disabled={isBusy} onClick={() => { setIsMenuOpen(false); setConfirm({ kind: "reset" }); }}>
              <RotateCcw className="w-4 h-4 mr-3" /> Reset game
            </button>
          )}

          {/* DELETE ITEM */}
          <button className="popover-item" disabled={isBusy} onClick={() => { setIsMenuOpen(false); setConfirm({ kind: "delete" }); }}>
            <Trash2 className="w-4 h-4 mr-3" /> Delete game
          </button>
        </PopoverMenu>

        {/* WIKI + HELP MODALS — opened from the menu */}
        {snapshot && <WikiSearch template={snapshot.wiki_search_template} embed={snapshot.wiki_embed} open={showWiki} onOpenChange={setShowWiki} />}
        <HelpButton title="Damnation" sections={HOST_HELP} open={showHelp} onOpenChange={setShowHelp} hideTrigger />

        {/* CONNECTION BANNER */}
        {snapshot && connection !== "live" && !isFinished && (
          <div className="dmn-connection dmn-connection-below-nav" role="status">
            <WifiOff className="w-4 h-4" aria-hidden /> Reconnecting…
          </div>
        )}

        {/* LOADING PLACEHOLDER */}
        {!snapshot && <p className="text-secondary">Loading board…</p>}

        {snapshot && (
          <div className="dmn-board-layout">

            {/* MAIN COLUMN */}
            <div className="dmn-board-main flex flex-col gap-4 min-w-0">

              {/* FINISHED BANNER */}
              {isFinished && (
                <div className="alert-blue">
                  <p className="alert-title"><Skull className="w-4 h-4" /> Game over</p>
                  <p className="alert-text">Final totals are shown below.</p>
                </div>
              )}

              {/* PLAYERS GRID */}
              <div className="dmn-grid" style={gridStyle}>
                {spots.map((player, index) =>
                  player ? (
                    <div
                      key={player.id}
                      data-player-id={player.id}
                      className={`dmn-slot flex flex-col min-w-0 ${dragId === player.id ? "dmn-dragging" : ""} ${dropId === player.id ? "dmn-drop-target" : ""}`}
                      style={slotStyle(index)}
                    >

                      {/* PLAYER CARD */}
                      <PlayerCard
                        expanded={expandedId === player.id}
                        onExpandedChange={(open) => setExpandedId(open ? player.id : null)}
                        player={player}
                        players={snapshot.players}
                        cells={snapshot.commander_damage}
                        commanderDamage={snapshot.commander_damage_enabled}
                        overlay={actions.overlay}
                        variant="board"
                        editable={!isFinished && !player.pending}
                        connected={null}
                        onLife={(delta) => actions.changeLife(player.id, delta)}
                        onCommander={(sourceId, delta) => actions.changeCommanderDamage(player.id, sourceId, delta)}
                        onStatus={(change) => actions.changeStatus(player.id, change)}
                        onRemove={isFinished || player.pending ? undefined : () => setConfirm({ kind: "kick", playerId: player.id, name: player.display_name })}
                        removeDisabled={isBusy}
                        onRename={isFinished || player.pending ? undefined : (displayName) => table.renamePlayer(player.id, displayName)}
                        onRecolor={isFinished || player.pending ? undefined : (colorKey) => table.recolorPlayer(player.id, colorKey)}
                        onGripPointerDown={isFinished || player.pending ? undefined : (event) => table.startDrag(event, player.id)}
                        onGripKey={(step) => table.stepPlayer(player.id, step)}
                        fill
                      />
                    </div>
                  ) : isFinished ? null : (
                    /* OPEN SPOT — a position nobody holds, with a button to add someone who has no phone */
                    <OpenSpotTile
                      key={`empty-${index}`}
                      position={index + 1}
                      isDropTarget={dropId === `spot:${index + 1}`}
                      style={slotStyle(index)}
                      waitingText="Waiting for a player…"
                      disabled={isBusy}
                      onAdd={() => table.addPlaceholderPlayer(index + 1)}
                      sizer={
                        <PlayerCard
                          player={placeholderPlayer(index + 1, snapshot.starting_life)}
                          players={[...snapshot.players, placeholderPlayer(index + 1, snapshot.starting_life)]}
                          cells={[]}
                          commanderDamage={snapshot.commander_damage_enabled}
                          overlay={actions.overlay}
                          variant="board"
                          editable
                          connected={null}
                          onLife={() => {}}
                          onCommander={() => {}}
                          onStatus={() => {}}
                          onRemove={() => {}}
                          onRename={async () => true}
                          onRecolor={() => {}}
                          onGripPointerDown={() => {}}
                          fill
                        />
                      }
                    />
                  )
                )}

                {/* NO PLAYERS PLACEHOLDER */}
                {snapshot.players.length === 0 && isFinished && (
                  <div className="dmn-empty-seat">Nobody joined this game.</div>
                )}
              </div>
            </div>

            {/* GAME CARD — setup (QR, join code, game setup, Start game) or activity, flipping between them */}
            <GameCard
              snapshot={snapshot}
              showSetup={showSetup}
              isBusy={isBusy}
              onShowSetup={setIsEditingGame}
              onSetupChange={(change) => hostCommand("/setup", change, "POST", setupPatch(change))}
              onOpenLayout={() => setShowLayoutPicker(true)}
              onCommanderDamageChange={(enabled) => void hostCommand("/commander-damage", { enabled }, "PUT", commanderDamagePatch(enabled))}
              onGuestManagementChange={(enabled) => void hostCommand("/guest-management", { enabled }, "PUT", guestManagementPatch(enabled))}
              onStart={() => {
                setIsEditingGame(false);
                void hostCommand("/joins", { open: false }, "POST", joiningPatch(false));
              }}
              onAllowJoining={(open) => void hostCommand("/joins", { open }, "POST", joiningPatch(open))}
            />
          </div>
        )}

        {/* CONFIRM MODAL */}
        <ConfirmModal
          isOpen={confirm !== null}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirmed}
          danger
          title={confirm?.kind === "delete" ? "Delete this game?" : confirm?.kind === "reset" ? "Reset this game?" : "Remove player?"}
          confirmLabel={confirm?.kind === "delete" ? "Delete" : confirm?.kind === "reset" ? "Reset" : "Remove"}
          message={
            confirm?.kind === "delete"
              ? "The game, its players and its history are deleted. This can't be undone."
              : confirm?.kind === "reset"
                ? // The title says what Reset does; nothing else needs saying.
                  undefined
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
            isSaving={false}
            onCancel={() => setShowLayoutPicker(false)}
            onPick={saveLayout}
          />
        )}
      </div>
    </div>
  );
}
