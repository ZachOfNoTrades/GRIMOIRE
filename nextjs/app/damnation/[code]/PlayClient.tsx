"use client";

import { ArrowLeftFromLine, DoorOpen, Skull, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import ConfirmModal from "@/components/ConfirmModal";
import { Button } from "@/components/ui/button";
import HelpButton from "@/components/ui/HelpButton";
import { generateUUID } from "@/lib/uuid";
import { PLAYER_HELP } from "@/app/modules/damnation/components/help";
import PlayerCard from "@/app/modules/damnation/components/PlayerCard";
import WikiSearch from "@/app/modules/damnation/components/WikiSearch";
import { arrangeSpots, cardsPerRow, resolveLayout, SLOT_NAMES } from "@/app/modules/damnation/lib/boardLayouts";
import {
  JOIN_CODE_PATTERN,
  NAME_MAX_LENGTH,
  PALETTE,
  TOKEN_STORAGE_PREFIX,
} from "@/app/modules/damnation/lib/constants";
import { useGameActions } from "@/app/modules/damnation/lib/useGameActions";
import { useSessionStream } from "@/app/modules/damnation/lib/useSessionStream";
import { useWakeLock } from "@/app/modules/damnation/lib/useWakeLock";
import type { GuestSnapshot, LobbyView } from "@/app/modules/damnation/types/damnation";

// Narrowest a card may get in the table layout before the phone falls back to the stacked view.
const LAYOUT_MIN_CARD_PX = 150;

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
  | { kind: "playing"; token: string; initial: GuestSnapshot }
  | { kind: "ended" };

export default function PlayClient({ code }: { code: string }) {
  const router = useRouter();

  // STATE
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

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
        onJoined={(token, snapshot) => {
          writeToken(code, token);
          setPhase({ kind: "playing", token, initial: snapshot });
        }}
        onRefresh={(notice) => loadLobby(notice)}
      />
    );
  }

  return (
    <Controller
      key={phase.token}
      code={code}
      token={phase.token}
      initial={phase.initial}
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
        writeToken(newCode, phase.token);
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
  onJoined,
  onRefresh,
}: {
  code: string;
  lobby: LobbyView;
  notice: string | null;
  onJoined: (token: string, snapshot: GuestSnapshot) => void;
  onRefresh: (notice: string | null) => void;
}) {
  // INPUT
  const [name, setName] = useState("");
  // Colors can be shared; preselecting one nobody has yet just makes cards easier to tell apart.
  const firstUnused = PALETTE.find((entry) => !lobby.taken_colors.includes(entry.key))?.key ?? PALETTE[0].key;
  const [color, setColor] = useState<string>(firstUnused);

  // STATE
  const [isJoining, setIsJoining] = useState(false);
  const canJoin = lobby.joinable && !!color && name.trim().length > 0 && !isJoining;

  async function send(body: Record<string, unknown>) {
    setIsJoining(true);
    try {
      const response = await fetch(`/api/damnation/${code}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op_id: generateUUID(), ...body }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "Couldn't join");
        // Someone may have taken the last spot or the name; show the game as it is now.
        if (response.status === 409) onRefresh(null);
        return;
      }
      onJoined(data.token, data.snapshot);
    } catch {
      toast.error("Couldn't reach the game — check your connection");
    } finally {
      setIsJoining(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canJoin) return;
    // Drop the on-screen keyboard; on a refusal (name or color taken) the toast must be visible.
    (document.activeElement as HTMLElement | null)?.blur();
    send({ display_name: name.trim(), color_key: color });
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
  token: string;
  initial: GuestSnapshot;
  onRemoved: (notice: string) => void;
  onEnded: () => void;
  onCodeChanged: (code: string) => void;
}) {
  const headers = useMemo(() => ({ "x-damnation-token": token }), [token]);

  // STATE
  const [showLeave, setShowLeave] = useState(false);
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

  const { snapshot, presence, connection, acceptSnapshot } = useSessionStream<GuestSnapshot>({
    url: `/api/damnation/${code}/stream`,
    headers,
    initial,
    onRevoked: handleRevoked,
  });

  const actions = useGameActions<GuestSnapshot>({
    baseUrl: `/api/damnation/${code}`,
    headers,
    acceptSnapshot,
    snapshot,
    onError: (message) => toast.error(message),
    onAccessLost: (status) => handleRevoked(status === 410 ? "ended" : "unauthorized"),
  });

  useWakeLock(true);

  // Width of the screen, for deciding whether the host's table layout fits.
  const [viewportWidth, setViewportWidth] = useState(0);
  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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

  const me = snapshot.players.find((player) => player.id === snapshot.me) ?? null;
  const others = snapshot.players.filter((player) => player.id !== snapshot.me);
  const connected = new Set(presence?.connected_player_ids ?? []);

  // The host's table layout, with every player (you included) where they sit — when each card
  // gets at least ~9rem. Otherwise (e.g. a 3-across layout on a portrait phone) your card stays on
  // top with everyone else below.
  const tableLayout = resolveLayout(snapshot.board_layout, snapshot.max_players);
  const layout = viewportWidth >= cardsPerRow(tableLayout) * LAYOUT_MIN_CARD_PX + 24 ? tableLayout : null;

  const cardProps = (playerId: string) => ({
    players: snapshot.players,
    cells: snapshot.commander_damage,
    commanderDamage: snapshot.commander_damage_enabled,
    overlay: actions.overlay,
    editable: true,
    onLife: (delta: number) => actions.changeLife(playerId, delta),
    onCommander: (sourceId: string, delta: number) => actions.changeCommanderDamage(playerId, sourceId, delta),
    onStatus: (change: { conceded?: boolean; eliminated_override?: boolean | null }) => actions.changeStatus(playerId, change),
  });

  return (
    <div className="page">
      <div className="dmn-controller">
        <Toaster position="top-center" />

        {/* HEADER — leave sits top-left, where a phone's back/exit control is expected */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">

            {/* LEAVE */}
            <Button className="btn-link !pl-0" onClick={() => setShowLeave(true)} title="Leave the game" aria-label="Leave the game">
              <ArrowLeftFromLine className="w-5 h-5" />
            </Button>

            {/* GAME CODE */}
            <span className="text-secondary">Game {snapshot.join_code ?? code}</span>
          </div>

          {/* HELP */}
          <HelpButton title="Damnation" sections={PLAYER_HELP} />
        </div>

        {/* CONNECTION BANNER */}
        {(connection !== "live" || actions.retrying) && (
          <div className="dmn-connection" role="status">
            <WifiOff className="w-4 h-4" aria-hidden />
            {actions.queued > 0 ? "Connection trouble — your changes will send when it's back" : "Reconnecting…"}
          </div>
        )}

        {/* TABLE LAYOUT */}
        {layout && (
          <div
            className="dmn-grid"
            style={{ gridTemplateColumns: layout.columns, gridTemplateAreas: layout.areas.map((row) => `"${row}"`).join(" ") }}
          >
            {arrangeSpots(snapshot.players, snapshot.max_players).map((player, index) => !player ? (
              /* OPEN SPOT — holds its place in the layout so the other cards keep their size */
              <div key={`open-${index}`} className="dmn-empty-seat" style={{ gridArea: SLOT_NAMES[index] }}>
                {snapshot.status === "lobby" ? "Waiting for a player…" : "Open spot"}
              </div>
            ) : (
              <div key={player.id} className="flex flex-col min-w-0" style={{ gridArea: SLOT_NAMES[index] }}>
                <PlayerCard
                  player={player}
                  variant={player.id === snapshot.me ? "self" : "other"}
                  isMe={player.id === snapshot.me}
                  connected={player.id === snapshot.me || player.rejoinable || player.manual ? null : connected.has(player.id)}
                  fill
                  {...cardProps(player.id)}
                />
              </div>
            ))}
          </div>
        )}

        {/* MY CARD */}
        {!layout && me && <PlayerCard player={me} variant="self" isMe connected={null} {...cardProps(me.id)} />}

        {/* OTHER PLAYERS */}
        {!layout && (
          <div className="dmn-controller-others">
            {others.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                variant="other"
                connected={player.rejoinable || player.manual ? null : connected.has(player.id)}
                {...cardProps(player.id)}
              />
            ))}
          </div>
        )}

        {/* WAITING PLACEHOLDER */}
        {others.length === 0 && <p className="text-secondary">Waiting for others to join…</p>}
      </div>

      {/* ACTION BAR */}
      <div className="dmn-action-bar">
        <WikiSearch template={snapshot.wiki_search_template} embed={snapshot.wiki_embed} />
      </div>

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
