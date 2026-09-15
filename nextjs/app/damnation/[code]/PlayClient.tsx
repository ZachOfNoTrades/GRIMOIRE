"use client";

import { ArrowLeftFromLine, BookOpen, DoorOpen, Skull, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "@/components/Toaster";
import ConfirmModal from "@/components/ConfirmModal";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { Button } from "@/components/ui/button";
import HelpButton from "@/components/ui/HelpButton";
import { generateUUID } from "@/lib/uuid";
import { PLAYER_HELP } from "@/app/modules/damnation/components/help";
import OpenSpotTile from "@/app/modules/damnation/components/OpenSpotTile";
import PlayerCard from "@/app/modules/damnation/components/PlayerCard";
import { placeholderPlayer } from "@/app/modules/damnation/lib/optimisticPatches";
import WikiSearch from "@/app/modules/damnation/components/WikiSearch";
import { arrangeSpots, resolveLayout, SLOT_NAMES } from "@/app/modules/damnation/lib/boardLayouts";
import {
  JOIN_CODE_PATTERN,
  NAME_MAX_LENGTH,
  PALETTE,
  TOKEN_STORAGE_PREFIX,
} from "@/app/modules/damnation/lib/constants";
import { useGameActions } from "@/app/modules/damnation/lib/useGameActions";
import { useSessionStream } from "@/app/modules/damnation/lib/useSessionStream";
import { useTableCommands } from "@/app/modules/damnation/lib/useTableCommands";
import { useWakeLock } from "@/app/modules/damnation/lib/useWakeLock";
import type { GuestSnapshot, LobbyView, PlayerView } from "@/app/modules/damnation/types/damnation";

// TOKEN STORAGE — the guest's only credential. localStorage so a closed tab or a sleeping
// phone gets back into the game; an in-memory fallback where storage is blocked (private mode),
// which still survives everything short of a reload.
const memoryTokens = new Map<string, string>();

function readToken(code: string): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_PREFIX + code) ?? memoryTokens.get(code) ?? null;
  } catch {
    return memoryTokens.get(code) ?? null;
  }
}

function writeToken(code: string, token: string): void {
  memoryTokens.set(code, token);
  try {
    window.localStorage.setItem(TOKEN_STORAGE_PREFIX + code, token);
  } catch {
    /* storage blocked — memory copy only */
  }
}

function clearToken(code: string): void {
  memoryTokens.delete(code);
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_PREFIX + code);
  } catch {
    /* storage blocked */
  }
}

type Phase =
  | { kind: "loading" }
  | { kind: "missing"; message: string }
  | { kind: "lobby"; lobby: LobbyView; notice: string | null }
  // Join pressed: the game is drawn from the lobby's table with this phone's card added, and the
  // real game takes over in place when the join comes back.
  | { kind: "joining"; lobby: LobbyView; provisional: GuestSnapshot; draft: JoinDraft }
  | { kind: "playing"; token: string; initial: GuestSnapshot }
  | { kind: "ended" };

interface JoinDraft {
  name: string;
  color: string;
}

// The game a joining phone is about to be part of, built from the lobby's view of the table. The
// server gives a new player the first free spot, so the provisional card goes there too.
function provisionalSnapshot(code: string, lobby: LobbyView, draft: JoinDraft): GuestSnapshot {
  const taken = new Set(lobby.table.players.map((player) => player.position));
  let position = 1;
  while (taken.has(position)) position += 1;
  const me: PlayerView = {
    id: "joining",
    position,
    display_name: draft.name,
    color_key: draft.color,
    life_total: lobby.table.starting_life,
    conceded: false,
    eliminated_override: null,
    eliminated: false,
    elimination_reason: null,
    rejoinable: false,
    manual: false,
    pending: true,
  };
  return {
    ...lobby.table,
    join_code: lobby.table.join_code ?? code,
    version: -1,
    events: [],
    former_players: [],
    players: [...lobby.table.players, me].sort((a, b) => a.position - b.position),
    me: me.id,
  };
}

export default function PlayClient({ code }: { code: string }) {
  const router = useRouter();
  // The tab reads "Damnation · Life Tracker"; the join code stays off it.
  useEntityTitle("Life Tracker");

  // STATE
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  // The join form's name and color, kept here so a refused join returns to a filled-in form.
  const [draft, setDraft] = useState<JoinDraft | null>(null);

  const loadLobby = useCallback(
    async (notice: string | null = null) => {
      if (!JOIN_CODE_PATTERN.test(code)) {
        setPhase({ kind: "missing", message: "That isn't a valid game code." });
        return;
      }
      try {
        const response = await fetch(`/api/damnation/${code}/lobby`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (response.status === 404) setPhase({ kind: "missing", message: "No game is using that code. It may have ended or been replaced." });
        else if (!response.ok) setPhase({ kind: "missing", message: data.error ?? "Couldn't reach the game. Try again." });
        else setPhase({ kind: "lobby", lobby: data, notice });
      } catch {
        setPhase({ kind: "missing", message: "Couldn't reach the game. Check your connection and try again." });
      }
    },
    [code]
  );

  // INITIAL LOAD — a stored token for this code puts the phone straight back into the game.
  useEffect(() => {
    async function init() {
      const token = readToken(code);
      if (!token) {
        await loadLobby();
        return;
      }
      try {
        const response = await fetch(`/api/damnation/${code}/state`, { headers: { "x-damnation-token": token }, cache: "no-store" });
        if (response.ok) {
          setPhase({ kind: "playing", token, initial: await response.json() });
          return;
        }
        if (response.status === 410) {
          clearToken(code);
          setPhase({ kind: "ended" });
          return;
        }
        if (response.status === 401) clearToken(code);
      } catch {
        // Offline on load: the controller would have nothing to show, so fall through to the lobby
        // error path, which offers a retry.
      }
      await loadLobby();
    }
    init();
  }, [code, loadLobby]);

  if (phase.kind === "loading") {
    return (
      <div className="page">
        {/* LOADING PLACEHOLDER */}
        <div className="dmn-controller"><p className="text-secondary">Finding your game…</p></div>
      </div>
    );
  }

  if (phase.kind === "missing") {
    return (
      <div className="page">
        <div className="dmn-controller">

          {/* MISSING GAME STATE */}
          <div className="alert-red">
            <p className="alert-title">Can&apos;t join</p>
            <p className="alert-text">{phase.message}</p>
          </div>

          {/* RETRY + ENTER ANOTHER CODE */}
          <div className="flex gap-2">
            <Button className="btn-off flex-1" onClick={() => loadLobby()}>Try again</Button>
            <Button className="btn-off flex-1" onClick={() => router.push("/damnation")}>Enter a code</Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase.kind === "ended") {
    return (
      <div className="page">
        <div className="dmn-controller">

          {/* ENDED STATE */}
          <div className="alert-blue">
            <p className="alert-title"><Skull className="w-4 h-4" /> Game over</p>
            <p className="alert-text">The host ended this game. Thanks for playing.</p>
          </div>
          <Button className="btn-off" onClick={() => router.push("/damnation")}>Join another game</Button>
        </div>
      </div>
    );
  }

  if (phase.kind === "lobby") {
    return (
      <JoinScreen
        code={code}
        lobby={phase.lobby}
        notice={phase.notice}
        draft={draft}
        onJoining={(nextDraft) => {
          setDraft(nextDraft);
          setPhase({ kind: "joining", lobby: phase.lobby, draft: nextDraft, provisional: provisionalSnapshot(code, phase.lobby, nextDraft) });
        }}
        onJoined={(token, snapshot) => {
          writeToken(code, token);
          setDraft(null);
          setPhase({ kind: "playing", token, initial: snapshot });
        }}
        onJoinFailed={(refresh) => (refresh ? loadLobby(null) : setPhase({ kind: "lobby", lobby: phase.lobby, notice: null }))}
        onRefresh={(notice) => loadLobby(notice)}
      />
    );
  }

  return (
    <Controller
      // One instance from Join through to playing, so the real game replaces the provisional one
      // in place rather than redrawing the screen.
      key="controller"
      code={code}
      token={phase.kind === "playing" ? phase.token : null}
      initial={phase.kind === "playing" ? phase.initial : phase.provisional}
      onRemoved={(notice) => {
        clearToken(code);
        loadLobby(notice);
      }}
      onEnded={() => {
        clearToken(code);
        setPhase({ kind: "ended" });
      }}
      onCodeChanged={(newCode) => {
        // The host issued a new code: carry the token over so a reload of the new URL still works.
        if (phase.kind === "playing") writeToken(newCode, phase.token);
        clearToken(code);
        router.replace(`/damnation/${newCode}`);
      }}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// JOIN
// ---------------------------------------------------------------------------------------------

function JoinScreen({
  code,
  lobby,
  notice,
  draft,
  onJoining,
  onJoined,
  onJoinFailed,
  onRefresh,
}: {
  code: string;
  lobby: LobbyView;
  notice: string | null;
  draft: JoinDraft | null;
  onJoining: (draft: JoinDraft) => void;
  onJoined: (token: string, snapshot: GuestSnapshot) => void;
  // After a refusal: `refresh` reloads the lobby (someone took the last spot or the name).
  onJoinFailed: (refresh: boolean) => void;
  onRefresh: (notice: string | null) => void;
}) {
  // INPUT
  const [name, setName] = useState(draft?.name ?? "");
  // Colors can be shared; preselecting one nobody has yet just makes cards easier to tell apart.
  const firstUnused = PALETTE.find((entry) => !lobby.taken_colors.includes(entry.key))?.key ?? PALETTE[0].key;
  const [color, setColor] = useState<string>(draft?.color ?? firstUnused);

  // STATE
  const [isJoining, setIsJoining] = useState(false);
  const canJoin = lobby.joinable && !!color && name.trim().length > 0 && !isJoining;

  // A new player switches to the game at once (onJoining) and the request finishes in the
  // background; rejoining as an existing player waits here, since that card's totals are already
  // on the table.
  async function send(body: Record<string, unknown>, joiningDraft: JoinDraft | null = null) {
    setIsJoining(true);
    if (joiningDraft) onJoining(joiningDraft);
    try {
      const response = await fetch(`/api/damnation/${code}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op_id: generateUUID(), ...body }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "Couldn't join");
        onJoinFailed(response.status === 409);
        return;
      }
      onJoined(data.token, data.snapshot);
    } catch {
      toast.error("Couldn't reach the game — check your connection");
      onJoinFailed(false);
    } finally {
      setIsJoining(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canJoin) return;
    // Drop the on-screen keyboard; on a refusal (name or color taken) the toast must be visible.
    (document.activeElement as HTMLElement | null)?.blur();
    send({ display_name: name.trim(), color_key: color }, { name: name.trim(), color });
  }

  return (
    <div className="page">
      <div className="dmn-controller">
        <Toaster position="top-center" />

        {/* HEADER */}
        <div className="flex items-center justify-between">
          <h1 className="text-page-title">
            <Skull className="w-7 h-7" /> Damnation
          </h1>
          <HelpButton title="Damnation" sections={PLAYER_HELP} />
        </div>

        {/* NOTICE — e.g. why this phone is no longer in the game */}
        {notice && (
          <div className="alert-yellow">
            <p className="alert-text">{notice}</p>
          </div>
        )}

        {/* JOIN FORM */}
        {lobby.joinable ? (
          <form className="card" onSubmit={submit}>
            <div className="card-content">

              {/* TABLE STATUS */}
              <p className="text-secondary">Game {code} · {lobby.player_count}/{lobby.max_players} players</p>

              {/* NAME LABEL */}
              <label className="text-h2" htmlFor="dmn-name">Your name</label>

              {/* NAME FIELD — autofocused: a name is the first and only required input */}
              <input
                id="dmn-name"
                autoFocus
                className="input-field"
                value={name}
                maxLength={NAME_MAX_LENGTH}
                onChange={(event) => setName(event.target.value)}
                autoComplete="nickname"
                enterKeyHint="go"
              />

              {/* COLOR LABEL */}
              <div className="text-h2">Your color</div>

              {/* COLOR PICKER */}
              <div className="flex flex-wrap gap-2" role="group" aria-label="Color">
                {PALETTE.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={`dmn-swatch dmn-seat-${entry.key}`}
                    aria-pressed={color === entry.key}
                    aria-label={entry.label}
                    title={entry.label}
                    onClick={() => setColor(entry.key)}
                  />
                ))}
              </div>

              {/* JOIN BUTTON */}
              <Button type="submit" className="btn-green mt-2" disabled={!canJoin}>
                {isJoining ? "Joining…" : "Join game"}
              </Button>
            </div>
          </form>
        ) : (
          /* CLOSED STATE */
          <div className="alert-blue">
            <p className="alert-title">{lobby.player_count >= lobby.max_players ? "The game is full" : "Joining is closed"}</p>
            <p className="alert-text">Ask the host to reopen joining{lobby.rejoinable_players.length > 0 ? ", or rejoin as your player below" : ""}.</p>
          </div>
        )}

        {/* REJOIN — after the host resumes a game, each phone picks its player again */}
        {lobby.rejoinable_players.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h2 className="text-card-title">Rejoin as</h2>
            </div>
            <div className="card-content">
              {lobby.rejoinable_players.map((player) => (
                <button
                  key={player.player_id}
                  type="button"
                  className={`dmn-card dmn-seat-${player.color_key}`}
                  disabled={isJoining}
                  onClick={() => send({ rejoin_player_id: player.player_id })}
                  title={`Rejoin as ${player.display_name}`}
                >
                  <span className="dmn-card-name">{player.display_name}</span>
                  <span className="dmn-tag">This is me</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* REFRESH */}
        {!lobby.joinable && (
          <Button className="btn-off" onClick={() => onRefresh(null)}>
            <DoorOpen className="w-4 h-4" /> Check again
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// CONTROLLER
// ---------------------------------------------------------------------------------------------

function Controller({
  code,
  token,
  initial,
  onRemoved,
  onEnded,
  onCodeChanged,
}: {
  code: string;
  // null while joining: the provisional game is shown, with nothing sent or streamed yet.
  token: string | null;
  initial: GuestSnapshot;
  onRemoved: (notice: string) => void;
  onEnded: () => void;
  onCodeChanged: (code: string) => void;
}) {
  const headers = useMemo(() => (token ? { "x-damnation-token": token } : undefined), [token]);

  // STATE
  const [showLeave, setShowLeave] = useState(false);
  const [showWiki, setShowWiki] = useState(false);
  // A player someone asked to remove, waiting for them to confirm.
  const [removeTarget, setRemoveTarget] = useState<PlayerView | null>(null);
  // At most one card's Commander damage / Status section is open at a time.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const handledRef = useRef(false);

  const handleRevoked = useCallback(
    (reason: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      if (reason === "ended") onEnded();
      else if (reason === "kicked") onRemoved("You're no longer in the game.");
      else onRemoved("This phone is no longer in the game.");
    },
    [onEnded, onRemoved]
  );

  const { snapshot: streamSnapshot, presence, connection, acceptSnapshot } = useSessionStream<GuestSnapshot>({
    url: token ? `/api/damnation/${code}/stream` : null,
    headers,
    initial,
    onRevoked: handleRevoked,
  });

  // The join came back: the real game replaces the provisional one (its version is -1, so this
  // snapshot is always accepted) before the stream's first snapshot arrives.
  useEffect(() => {
    if (token) acceptSnapshot(initial);
  }, [token, initial, acceptSnapshot]);

  const actions = useGameActions<GuestSnapshot>({
    baseUrl: token ? `/api/damnation/${code}` : null,
    headers,
    acceptSnapshot,
    snapshot: streamSnapshot,
    onError: (message) => toast.error(message),
    onAccessLost: (status) => handleRevoked(status === 410 ? "ended" : "unauthorized"),
  });

  // TABLE COMMANDS — adding, renaming, recoloring, moving and removing players, while the host lets
  // guests manage players; shown at once and sent in order (lib/useTableCommands.ts).
  const table = useTableCommands<GuestSnapshot>({
    baseUrl: token ? `/api/damnation/${code}` : null,
    headers,
    serverSnapshot: streamSnapshot,
    acceptSnapshot,
    onError: (message) => toast.error(message),
  });
  const snapshot = table.snapshot;

  useWakeLock(true);

  // Follow a code rotation so the address bar (and a reload) matches the live code.
  useEffect(() => {
    if (snapshot?.join_code && snapshot.join_code !== code) onCodeChanged(snapshot.join_code);
  }, [snapshot?.join_code, code, onCodeChanged]);

  async function leave() {
    setShowLeave(false);
    try {
      await fetch(`/api/damnation/${code}/leave`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ op_id: generateUUID() }),
      });
    } catch {
      /* leaving locally regardless */
    }
    handledRef.current = true;
    onRemoved("You left the game.");
  }

  if (!snapshot) return null;

  const connected = new Set(presence?.connected_player_ids ?? []);

  // The host's table layout, exactly as on the board: every player (you included) where they sit
  // and the open spots between them, whatever the screen width (narrow cards compact themselves).
  const layout = resolveLayout(snapshot.board_layout, snapshot.max_players);
  // Whether this phone gets the board's player controls (until the join comes back nothing can be sent).
  const canManage = !!token && snapshot.guests_manage_players;

  const cardProps = (playerId: string) => ({
    players: snapshot.players,
    cells: snapshot.commander_damage,
    commanderDamage: snapshot.commander_damage_enabled,
    overlay: actions.overlay,
    editable: true,
    expanded: playerId !== "" && expandedId === playerId,
    onExpandedChange: (open: boolean) => setExpandedId(open ? playerId : null),
    // Until the join comes back nothing can be sent, so taps do nothing for that moment.
    onLife: (delta: number) => token && actions.changeLife(playerId, delta),
    onCommander: (sourceId: string, delta: number) => token && actions.changeCommanderDamage(playerId, sourceId, delta),
    onStatus: (change: { conceded?: boolean; eliminated_override?: boolean | null }) => token && actions.changeStatus(playerId, change),
  });

  return (
    <div className="page">
      <div className="dmn-controller">
        <Toaster position="top-center" />

        {/* HEADER — leave sits top-left, where a phone's back/exit control is expected */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">

            {/* LEAVE */}
            <Button className="btn-link !pl-0" onClick={() => setShowLeave(true)} disabled={!token} title="Leave the game" aria-label="Leave the game">
              <ArrowLeftFromLine className="w-5 h-5" />
            </Button>

            {/* GAME CODE */}
            <span className="text-secondary">Game {snapshot.join_code ?? code}</span>
          </div>

          {/* WIKI + HELP */}
          <div className="flex items-center">
            <Button className="btn-link" onClick={() => setShowWiki(true)} title="Search the wiki" aria-label="Search the wiki">
              <BookOpen className="w-5 h-5" />
            </Button>
            <HelpButton title="Damnation" sections={PLAYER_HELP} />
          </div>
        </div>

        {/* CONNECTION BANNER */}
        {/* Only once a connection has dropped — not while it is first opening, which would flash
            the notice on every join and reload. */}
        {token && (connection === "reconnecting" || actions.retrying) && (
          <div className="dmn-connection" role="status">
            <WifiOff className="w-4 h-4" aria-hidden />
            {actions.queued > 0 ? "Connection trouble — your changes will send when it's back" : "Reconnecting…"}
          </div>
        )}

        {/* TABLE LAYOUT */}
        <div
          className="dmn-grid"
          style={{ gridTemplateColumns: layout.columns, gridTemplateAreas: layout.areas.map((row) => `"${row}"`).join(" ") }}
        >
          {arrangeSpots(snapshot.players, snapshot.max_players).map((player, index) => !player ? (
            /* OPEN SPOT — holds its place in the layout so the other cards keep their size */
            <OpenSpotTile
              key={`open-${index}`}
              position={index + 1}
              style={{ gridArea: SLOT_NAMES[index] }}
              waitingText="Waiting for a player…"
              isDropTarget={table.dropId === `spot:${index + 1}`}
              onAdd={canManage ? () => table.addPlaceholderPlayer(index + 1) : undefined}
              sizer={
                <PlayerCard
                  player={placeholderPlayer(index + 1, snapshot.starting_life)}
                  variant="other"
                  connected={null}
                  fill
                  {...cardProps("")}
                  players={[...snapshot.players, placeholderPlayer(index + 1, snapshot.starting_life)]}
                />
              }
            />
          ) : (
            <div
              key={player.id}
              data-player-id={player.id}
              className={`flex flex-col min-w-0 ${table.dragId === player.id ? "dmn-dragging" : ""} ${table.dropId === player.id ? "dmn-drop-target" : ""}`}
              style={{ gridArea: SLOT_NAMES[index] }}
            >
              <PlayerCard
                player={player}
                variant={player.id === snapshot.me ? "self" : "other"}
                connected={player.id === snapshot.me || player.rejoinable || player.manual ? null : connected.has(player.id)}
                fill
                {...cardProps(player.id)}
                {...(canManage && !player.pending
                  ? {
                      onRename: (displayName: string) => table.renamePlayer(player.id, displayName),
                      onRecolor: (colorKey: string) => table.recolorPlayer(player.id, colorKey),
                      // Your own card has Leave instead.
                      onRemove: player.id === snapshot.me ? undefined : () => setRemoveTarget(player),
                      onGripPointerDown: (event: React.PointerEvent) => table.startDrag(event, player.id),
                      onGripKey: (step: -1 | 1) => table.stepPlayer(player.id, step),
                    }
                  : {})}
              />
            </div>
          ))}
        </div>
      </div>

      {/* WIKI SEARCH — opened from the header */}
      <WikiSearch template={snapshot.wiki_search_template} embed={snapshot.wiki_embed} open={showWiki} onOpenChange={setShowWiki} />

      {/* REMOVE PLAYER CONFIRM — while the host lets guests manage players */}
      <ConfirmModal
        isOpen={removeTarget !== null}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget) void table.removePlayer(removeTarget.id);
          setRemoveTarget(null);
        }}
        danger
        title="Remove player?"
        confirmLabel="Remove"
        message={removeTarget ? `${removeTarget.display_name} is removed from the game.` : ""}
      />

      {/* LEAVE CONFIRM */}
      <ConfirmModal
        isOpen={showLeave}
        onCancel={() => setShowLeave(false)}
        onConfirm={leave}
        title="Leave the game?"
        confirmLabel="Leave"
        message="You're taken out of the game along with your life and commander damage. You can join again while joining is open."
      />
    </div>
  );
}
