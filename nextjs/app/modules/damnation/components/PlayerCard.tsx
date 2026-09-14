"use client";

import { ChevronDown, ChevronUp, Skull, Swords } from "lucide-react";
import { useState } from "react";
import { COMMANDER_DAMAGE_LETHAL, isColorKey } from "../lib/constants";
import type { PendingOverlay } from "../lib/useGameActions";
import type { CommanderDamageCell, PlayerView } from "../types/damnation";

// One player's card, laid out the same everywhere: tap the left or right half of the number for
// −1/+1, with ±5 buttons underneath. Variants only tag where it is shown:
//   self  — the phone owner's own card
//   other — another player on a phone
//   board — the shared screen
// Any player may change any card, so every variant can edit when `editable` is set.

interface PlayerCardProps {
  player: PlayerView;
  players: PlayerView[];
  cells: CommanderDamageCell[];
  overlay: PendingOverlay;
  variant: "self" | "other" | "board";
  editable: boolean;
  connected: boolean | null;
  isMe?: boolean;
  // The host's commander damage setting; off leaves only the status controls behind the toggle.
  commanderDamage?: boolean;
  // Stretch to fill a table-layout cell: name stays at the top, the tap zones take the space.
  fill?: boolean;
  onLife: (delta: number) => void;
  onCommander: (sourcePlayerId: string, delta: number) => void;
  onStatus: (change: { conceded?: boolean; eliminated_override?: boolean | null }) => void;
}

const REASON_LABEL: Record<string, string> = {
  life: "Out — no life",
  commander_damage: "Out — commander damage",
  conceded: "Conceded",
  host: "Out",
};

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

export default function PlayerCard({
  player,
  players,
  cells,
  overlay,
  variant,
  editable,
  connected,
  isMe = false,
  commanderDamage = true,
  fill = false,
  onLife,
  onCommander,
  onStatus,
}: PlayerCardProps) {
  // STATE
  const [showCommander, setShowCommander] = useState(false);
  const pendingLife = overlay.life[player.id] ?? 0;
  const life = player.life_total + pendingLife;
  const seatClass = isColorKey(player.color_key) ? `dmn-seat-${player.color_key}` : "dmn-seat-artifact";
  const opponents = players.filter((other) => other.id !== player.id);

  // Commander damage this player has taken, per source, including taps still in flight.
  const damageFrom = (sourceId: string) => {
    const stored = cells.find((cell) => cell.source_player_id === sourceId && cell.target_player_id === player.id)?.damage ?? 0;
    return Math.max(0, stored + (overlay.commander[`${player.id}:${sourceId}`] ?? 0));
  };
  const damageChips = commanderDamage
    ? opponents.map((source) => ({ source, damage: damageFrom(source.id) })).filter((entry) => entry.damage > 0)
    : [];

  const cardClass = [
    "dmn-card",
    seatClass,
    variant === "self" ? "dmn-card-self" : "",
    variant === "board" ? "dmn-card-board" : "",
    player.eliminated ? "dmn-card-out" : "",
    fill ? "flex-1" : "",
  ].join(" ");

  return (
    /* PLAYER CARD */
    <section className={cardClass} aria-label={`${player.display_name}, ${life} life`}>

      {/* CARD HEAD */}
      <div className="dmn-card-head">

        {/* PRESENCE */}
        {connected !== null && (
          <span
            className={`dmn-presence ${connected ? "dmn-presence-on" : ""}`}
            title={connected ? "Phone connected" : "Phone not connected"}
            aria-label={connected ? "Phone connected" : "Phone not connected"}
          />
        )}

        {/* NAME — guest-supplied, rendered as text only */}
        <span className="dmn-card-name">{player.display_name}</span>

        {/* TAGS */}
        {isMe && <span className="dmn-tag">You</span>}
      </div>

      {/* ELIMINATION */}
      {player.eliminated && player.elimination_reason && (
        <span className="dmn-out-reason">
          <Skull className="w-4 h-4" aria-hidden /> {REASON_LABEL[player.elimination_reason]}
        </span>
      )}

      {editable ? (
        /* LIFE — the two halves of the number are the ±1 buttons, the same on every card */
        <div className={`dmn-tap-zones ${fill ? "flex-1" : ""}`}>

          {/* LOSE ONE */}
          <button type="button" className="dmn-tap-zone dmn-tap-zone-minus" onClick={() => onLife(-1)} aria-label={`${player.display_name} lose 1 life`} title="Lose 1 life">
            −
          </button>

          {/* GAIN ONE */}
          <button type="button" className="dmn-tap-zone dmn-tap-zone-plus" onClick={() => onLife(1)} aria-label={`${player.display_name} gain 1 life`} title="Gain 1 life">
            +
          </button>

          {/* LIFE TOTAL */}
          <div className="dmn-life" aria-live="polite">
            {life}
            {pendingLife !== 0 && <span className="dmn-pending">{formatSigned(pendingLife)}</span>}
          </div>
        </div>
      ) : (
        /* LIFE — read only (game over) */
        <div className="dmn-life" aria-live="polite" style={fill ? { marginBlock: "auto" } : undefined}>
          {life}
        </div>
      )}

      {/* ±5 */}
      {editable && (
        <div className="dmn-status-row">
          <button type="button" className="dmn-step" onClick={() => onLife(-5)} aria-label={`${player.display_name} lose 5 life`} title="Lose 5 life">−5</button>
          <button type="button" className="dmn-step" onClick={() => onLife(5)} aria-label={`${player.display_name} gain 5 life`} title="Gain 5 life">+5</button>
        </div>
      )}

      {/* COMMANDER DAMAGE SUMMARY */}
      {damageChips.length > 0 && (
        <div className="dmn-cmdr-summary" aria-label="Commander damage taken">
          {damageChips.map(({ source, damage }) => (
            <span
              key={source.id}
              className={`dmn-cmdr-chip ${damage >= COMMANDER_DAMAGE_LETHAL ? "dmn-cmdr-chip-lethal" : ""}`}
              title={`${damage} commander damage from ${source.display_name}`}
            >
              <Swords className="w-3 h-3" aria-hidden /> {source.display_name} {damage}
            </span>
          ))}
        </div>
      )}

      {/* COMMANDER DAMAGE + STATUS EDITOR */}
      {editable && (!commanderDamage || opponents.length > 0) && (
        <>
          {/* TOGGLE */}
          <button
            type="button"
            className="dmn-toggle"
            onClick={() => setShowCommander((open) => !open)}
            aria-expanded={showCommander}
          >
            <span>{commanderDamage ? "Commander damage taken" : "Status"}</span>
            {showCommander ? <ChevronUp className="w-4 h-4" aria-hidden /> : <ChevronDown className="w-4 h-4" aria-hidden />}
          </button>

          {/* ROWS — one per opposing commander */}
          {showCommander && (
            <div className="dmn-cmdr-rows">
              {commanderDamage && opponents.map((source) => (
                <div key={source.id} className="dmn-cmdr-row">
                  <Swords className="w-4 h-4" aria-hidden />
                  <span className="dmn-card-name">{source.display_name}</span>
                  <button type="button" className="dmn-step" onClick={() => onCommander(source.id, -1)} aria-label={`Remove 1 commander damage from ${source.display_name}`} title="Remove 1">−</button>
                  <span className="dmn-cmdr-value">{damageFrom(source.id)}</span>
                  <button type="button" className="dmn-step" onClick={() => onCommander(source.id, 1)} aria-label={`Add 1 commander damage from ${source.display_name}`} title="Add 1 (also costs 1 life)">+</button>
                </div>
              ))}

              {/* STATUS CONTROLS */}
              <div className="dmn-status-row">
                {player.eliminated ? (
                  <button type="button" className="dmn-step" onClick={() => onStatus({ conceded: false, eliminated_override: false })} title="Put this player back in the game">
                    Back in
                  </button>
                ) : (
                  <>
                    <button type="button" className="dmn-step" onClick={() => onStatus({ conceded: true })} title="Mark this player as having conceded">
                      Concede
                    </button>
                    <button type="button" className="dmn-step" onClick={() => onStatus({ eliminated_override: true })} title="Mark this player as out">
                      Out
                    </button>
                  </>
                )}
                {player.eliminated_override !== null && !player.eliminated && (
                  <button type="button" className="dmn-step" onClick={() => onStatus({ eliminated_override: null })} title="Go back to deciding from life and commander damage">
                    Auto
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
