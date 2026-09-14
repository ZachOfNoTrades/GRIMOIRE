"use client";

import { DoorOpen, LogOut, Skull, Undo2, WifiOff } from "lucide-react";
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

// TOKEN STORAGE — the guest's only credential. localStorage so a closed tab or a sleeping
// phone gets its seat back; an in-memory fallback where storage is blocked (private mode),
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
        const response = await fetch(`/api/play/${code}/lobby`, { cache: "no-store" });
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

  // INITIAL LOAD — a stored token for this code puts the phone straight back in its seat.
  useEffect(() => {
    async function init() {
      const token = readToken(code);
      if (!token) {
        await loadLobby();
        return;
      }
      try {
        const response = await fetch(`/api/play/${code}/state`, { headers: { "x-damnation-token": token }, cache: "no-store" });
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
            <Button className="btn-off flex-1" onClick={() => router.push("/play")}>Enter a code</Button>
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
          <Button className="btn-off" onClick={() => router.push("/play")}>Join another game</Button>
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
      onSeatLost={(notice) => {
        clearToken(code);
        loadLobby(notice);
      }}
      onEnded={() => {
        clearToken(code);
        setPhase({ kind: "ended" });
      }}
      onCodeChanged={(newCode) => {
        // The host issued a new code: carry the seat over so a reload of the new URL still works.
        writeToken(newCode, phase.token);
        clearToken(code);
        router.replace(`/play/${newCode}`);
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
  const firstFree = PALETTE.find((entry) => !lobby.taken_colors.includes(entry.key))?.key ?? null;
  const [color, setColor] = useState<string | null>(firstFree);

  // STATE
  const [isJoining, setIsJoining] = useState(false);
  const canJoin = lobby.joinable && !!color && name.trim().length > 0 && !isJoining;

  async function send(body: Record<string, unknown>) {
    setIsJoining(true);
    try {
      const response = await fetch(`/api/play/${code}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op_id: generateUUID(), ...body }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data.error ?? "Couldn't join");
        // Someone may have taken the colour or seat; show the table as it is now.
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
    if (canJoin) send({ display_name: name.trim(), color_key: color });
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

        {/* NOTICE — e.g. why this phone lost its seat */}
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
              <p className="text-secondary">Game {code} · {lobby.seats_taken}/{lobby.max_seats} seated</p>

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

              {/* COLOUR LABEL */}
              <div className="text-h2">Your colour</div>

              {/* COLOUR PICKER */}
              <div className="flex flex-wrap gap-2" role="group" aria-label="Colour">
                {PALETTE.map((entry) => {
                  const taken = lobby.taken_colors.includes(entry.key);
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      className={`dmn-swatch dmn-seat-${entry.key}`}
                      aria-pressed={color === entry.key}
                      aria-label={`${entry.label}${taken ? " (taken)" : ""}`}
                      title={`${entry.label}${taken ? " (taken)" : ""}`}
                      disabled={taken}
                      onClick={() => setColor(entry.key)}
                    />
                  );
                })}
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
            <p className="alert-title">{lobby.seats_taken >= lobby.max_seats ? "The table is full" : "Joining is closed"}</p>
            <p className="alert-text">Ask the host to reopen joining{lobby.open_seats.length > 0 ? ", or take over a freed seat below" : ""}.</p>
          </div>
        )}

        {/* OPEN SEATS — seats the host freed (a player's phone died) */}
        {lobby.open_seats.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h2 className="text-card-title">Take over a seat</h2>
            </div>
            <div className="card-content">
              {lobby.open_seats.map((seat) => (
                <button
                  key={seat.player_id}
                  type="button"
                  className={`dmn-card dmn-seat-${seat.color_key}`}
                  disabled={isJoining}
                  onClick={() => send({ claim_player_id: seat.player_id })}
                  title={`Continue as ${seat.display_name}`}
                >
                  <span className="dmn-card-name">{seat.display_name}</span>
                  <span className="dmn-tag">Continue as this player</span>
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
  onSeatLost,
  onEnded,
  onCodeChanged,
}: {
  code: string;
  token: string;
  initial: GuestSnapshot;
  onSeatLost: (notice: string) => void;
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
      else if (reason === "kicked") onSeatLost("The host removed you from the game.");
      else if (reason === "seat_freed") onSeatLost("The host freed your seat. You can take it back over below.");
      else onSeatLost("This phone is no longer seated in the game.");
    },
    [onEnded, onSeatLost]
  );

  const { snapshot, presence, connection, acceptSnapshot } = useSessionStream<GuestSnapshot>({
    url: `/api/play/${code}/stream`,
    headers,
    initial,
    onRevoked: handleRevoked,
  });

  const actions = useGameActions<GuestSnapshot>({
    baseUrl: `/api/play/${code}`,
    headers,
    acceptSnapshot,
    snapshot,
    onError: (message) => toast.error(message),
    onAccessLost: (status) => handleRevoked(status === 410 ? "ended" : "unauthorized"),
  });

  useWakeLock(true);

  // Follow a code rotation so the address bar (and a reload) matches the live code.
  useEffect(() => {
    if (snapshot?.join_code && snapshot.join_code !== code) onCodeChanged(snapshot.join_code);
  }, [snapshot?.join_code, code, onCodeChanged]);

  async function leave() {
    setShowLeave(false);
    try {
      await fetch(`/api/play/${code}/leave`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ op_id: generateUUID() }),
      });
    } catch {
      /* leaving locally regardless */
    }
    handledRef.current = true;
    onSeatLost("You left your seat. It stays open, so you can take it back over.");
  }

  if (!snapshot) return null;

  const me = snapshot.players.find((player) => player.id === snapshot.me) ?? null;
  const others = snapshot.players.filter((player) => player.id !== snapshot.me);
  const connected = new Set(presence?.connected_player_ids ?? []);

  const cardProps = (playerId: string) => ({
    players: snapshot.players,
    cells: snapshot.commander_damage,
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

        {/* HEADER */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-secondary">Game {snapshot.join_code ?? code}</span>
          <div className="flex items-center gap-1">
            <HelpButton title="Damnation" sections={PLAYER_HELP} />
            <Button className="btn-link" onClick={() => setShowLeave(true)} title="Leave your seat" aria-label="Leave your seat">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* CONNECTION BANNER */}
        {(connection !== "live" || actions.retrying) && (
          <div className="dmn-connection" role="status">
            <WifiOff className="w-4 h-4" aria-hidden />
            {actions.queued > 0 ? "Connection trouble — your changes will send when it's back" : "Reconnecting…"}
          </div>
        )}

        {/* MY CARD */}
        {me && <PlayerCard player={me} variant="self" isMe connected={null} {...cardProps(me.id)} />}

        {/* OTHER PLAYERS */}
        <div className="dmn-controller-others">
          {others.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              variant="other"
              connected={player.open_seat ? null : connected.has(player.id)}
              {...cardProps(player.id)}
            />
          ))}
        </div>

        {/* WAITING PLACEHOLDER */}
        {others.length === 0 && <p className="text-secondary">Waiting for others to join…</p>}
      </div>

      {/* ACTION BAR */}
      <div className="dmn-action-bar">
        <Button className="btn-off" onClick={actions.undo} title="Undo your last change" aria-label="Undo your last change">
          <Undo2 className="w-5 h-5" /> Undo
        </Button>
        <WikiSearch template={snapshot.wiki_search_template} embed={snapshot.wiki_embed} />
      </div>

      {/* LEAVE CONFIRM */}
      <ConfirmModal
        isOpen={showLeave}
        onCancel={() => setShowLeave(false)}
        onConfirm={leave}
        title="Leave your seat?"
        confirmLabel="Leave"
        message="Your life and commander damage stay on the seat, and anyone with the code can take it over — including you."
      />
    </div>
  );
}
