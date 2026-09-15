"use client";

import { DoorClosed, DoorOpen, History, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import ActivityFeed from "./ActivityFeed";
import GameSetup from "./GameSetup";
import QrCode from "./QrCode";
import type { HostSnapshot } from "../types/damnation";

// The board's side card, two faces of one card that flips between them: setup (QR code, join
// code, starting life, players, layout, commander damage, Start game) and activity (the game's
// history). The board decides which face shows: setup before the game starts, activity once it is
// under way, and setup again from Edit game to change the game in flight.

// Shown under the closed-joining overlay in place of the real code, which stays off the page.
const CLOSED_JOIN_CODE = "ABCD";
const CLOSED_JOIN_URL = "https://grimoire.invalid/damnation/ABCD";

export default function GameCard({
  snapshot,
  showSetup,
  isBusy,
  onShowSetup,
  onSetupChange,
  onOpenLayout,
  onCommanderDamageChange,
  onStart,
  onAllowJoining,
}: {
  snapshot: HostSnapshot;
  showSetup: boolean;
  isBusy: boolean;
  onShowSetup: (show: boolean) => void;
  onSetupChange: (change: { starting_life?: number; max_players?: number }) => Promise<boolean>;
  onOpenLayout: () => void;
  onCommanderDamageChange: (enabled: boolean) => void;
  onStart: () => void;
  // Opens (Allow joining) or closes joining during the game.
  onAllowJoining: (open: boolean) => void;
}) {
  const isLobby = snapshot.status === "lobby";
  const isActive = snapshot.status === "active";
  // During the game with joining closed, the code is hidden behind Allow joining.
  const isClosed = isActive && !snapshot.joining_open;
  const joinHost = snapshot.join_url && snapshot.join_code ? snapshot.join_url.replace("https://", "").replace(`/${snapshot.join_code}`, "") : null;

  return (
    <div className="dmn-game-card" data-face={showSetup ? "setup" : "activity"}>
      <div className="dmn-game-flipper">

        {/* SETUP FACE */}
        <section className="card dmn-game-face dmn-game-face-setup" inert={!showSetup} aria-label="Game setup">

          {/* SETUP HEADER — during the game (Edit game), joining open or not: back to the activity, mirroring Edit game */}
          {isActive && (
            <div className="dmn-game-face-header">
              <h2 className="text-card-title">Setup</h2>
              <Button className="btn-link" onClick={() => onShowSetup(false)} title="Back to the game's activity">
                <History className="w-4 h-4" aria-hidden /> View activity
              </Button>
            </div>
          )}

          <div className="dmn-join">

            {/* JOIN CODE — QR code, hint, code and count. Once the game has started joining is closed:
                a stand-in code sits under a disabled overlay (the real one isn't rendered) until
                Allow joining reopens it. */}
            {snapshot.join_url && snapshot.join_code && (
              <div className="dmn-join-code" data-closed={isClosed || undefined}>
                <div className="dmn-join-code-content" aria-hidden={isClosed || undefined} inert={isClosed}>
                  <QrCode
                    value={isClosed ? CLOSED_JOIN_URL : snapshot.join_url}
                    label={isClosed ? "Joining is closed" : `QR code to join game ${snapshot.join_code}`}
                  />
                  <span className="dmn-join-hint text-secondary">Scan, or go to <strong>{joinHost}</strong> and enter</span>
                  {isClosed ? (
                    <span className="dmn-code">{CLOSED_JOIN_CODE}</span>
                  ) : (
                    <span className="dmn-code" aria-label={`Join code ${snapshot.join_code.split("").join(" ")}`}>{snapshot.join_code}</span>
                  )}
                  <span className="dmn-join-count text-secondary">
                    {isClosed ? "Joining is closed" : `${snapshot.players.length}/${snapshot.max_players} players`}
                  </span>
                  {isActive && snapshot.joining_open && (
                    /* CLOSE JOINING — during the game, once joining has been allowed */
                    <Button className="btn-link dmn-join-close" disabled={isBusy} onClick={() => onAllowJoining(false)} title="Stop new players from joining">
                      <DoorClosed className="w-4 h-4" aria-hidden /> Close joining
                    </Button>
                  )}
                </div>

                {/* ALLOW JOINING — over the stand-in; reopens joining, which shows the real code */}
                {isClosed && (
                  <div className="dmn-join-closed">
                    <Button className="btn-blue" disabled={isBusy} onClick={() => onAllowJoining(true)} title="Reopen joining so a late arrival or a lost phone can join">
                      <DoorOpen className="w-4 h-4" aria-hidden /> Allow joining
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* GAME SETUP */}
            <div className="dmn-join-setup">
              <GameSetup
                startingLife={snapshot.starting_life}
                maxPlayers={snapshot.max_players}
                playerCount={snapshot.players.length}
                disabled={isBusy}
                onChange={onSetupChange}
                onOpenLayout={onOpenLayout}
                commanderDamage={snapshot.commander_damage_enabled}
                onCommanderDamageChange={onCommanderDamageChange}
              />
            </div>

            {/* START GAME — closes joining */}
            {isLobby && (
              <div className="dmn-game-actions">
                <Button className="btn-green" disabled={isBusy || snapshot.players.length === 0} onClick={onStart} title="Close joining and start playing">
                  <DoorClosed className="w-4 h-4" aria-hidden /> Start game
                </Button>
              </div>
            )}

          </div>
        </section>

        {/* ACTIVITY FACE */}
        <section className="card dmn-game-face dmn-game-face-activity dmn-activity" inert={showSetup} aria-label="Activity">

          {/* ACTIVITY HEADER — Edit game flips to the setup, except after the game is over */}
          <div className="dmn-game-face-header">
            <h2 className="text-card-title">Activity</h2>
            {isActive && (
              <Button className="btn-link" disabled={isBusy} onClick={() => onShowSetup(true)} title="Change the game's setup, or let someone join">
                <SlidersHorizontal className="w-4 h-4" aria-hidden /> Edit game
              </Button>
            )}
          </div>

          <ActivityFeed events={snapshot.events} players={snapshot.players} formerPlayers={snapshot.former_players} />
        </section>
      </div>
    </div>
  );
}
