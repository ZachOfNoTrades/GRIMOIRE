"use client";

import { Check, DoorClosed, DoorOpen, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import ActivityFeed from "./ActivityFeed";
import GameSetup from "./GameSetup";
import QrCode from "./QrCode";
import type { HostSnapshot } from "../types/damnation";

// The board's side card, two faces of one card that flips between them: setup (QR code, join
// code, starting life, players, layout, Start game) and activity (the game's history). The board
// decides which face shows: setup before the game starts, activity once it is under way, and
// setup again from Edit game to change the game in flight.

export default function GameCard({
  snapshot,
  showSetup,
  isBusy,
  onShowSetup,
  onSetupChange,
  onOpenLayout,
  onStart,
  onReopenJoining,
}: {
  snapshot: HostSnapshot;
  showSetup: boolean;
  isBusy: boolean;
  onShowSetup: (show: boolean) => void;
  onSetupChange: (change: { starting_life?: number; max_players?: number }) => Promise<boolean>;
  onOpenLayout: () => void;
  onStart: () => void;
  onReopenJoining: () => void;
}) {
  const isLobby = snapshot.status === "lobby";
  const isActive = snapshot.status === "active";
  const joinHost = snapshot.join_url && snapshot.join_code ? snapshot.join_url.replace("https://", "").replace(`/${snapshot.join_code}`, "") : null;

  return (
    <div className="dmn-game-card" data-face={showSetup ? "setup" : "activity"}>
      <div className="dmn-game-flipper">

        {/* SETUP FACE */}
        <section className="card dmn-game-face dmn-game-face-setup" inert={!showSetup} aria-label="Game setup">

          <div className="dmn-join">

            {/* QR CODE */}
            {snapshot.join_url && snapshot.join_code && (
              <QrCode value={snapshot.join_url} label={`QR code to join game ${snapshot.join_code}`} />
            )}

            {/* JOIN BODY */}
            <div className="dmn-join-body">

              {/* JOIN TEXT */}
              {snapshot.join_code && (
                <div className="dmn-join-text">
                  <span className="dmn-join-hint text-secondary">Scan, or go to <strong>{joinHost}</strong> and enter</span>
                  <span className="dmn-code" aria-label={`Join code ${snapshot.join_code.split("").join(" ")}`}>{snapshot.join_code}</span>
                  <span className="dmn-join-count text-secondary">
                    {isLobby
                      ? `${snapshot.players.length}/${snapshot.max_players} players`
                      : "Joining is closed — players rejoin with the code"}
                  </span>
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
                />
              </div>

              {/* START GAME — closes joining. Once under way (Edit game): reopen joining for a late
                  arrival, or go back to the activity. */}
              <div className="dmn-game-actions">
                {isLobby ? (
                  <Button className="btn-green" disabled={isBusy || snapshot.players.length === 0} onClick={onStart} title="Close joining and start playing">
                    <DoorClosed className="w-4 h-4" aria-hidden /> Start game
                  </Button>
                ) : (
                  <>
                    <Button className="btn-off" disabled={isBusy} onClick={onReopenJoining} title="Let a late arrival join">
                      <DoorOpen className="w-4 h-4" aria-hidden /> Reopen joining
                    </Button>
                    {isActive && (
                      <Button className="btn-blue" onClick={() => onShowSetup(false)} title="Back to the game's activity">
                        <Check className="w-4 h-4" aria-hidden /> Done
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
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
