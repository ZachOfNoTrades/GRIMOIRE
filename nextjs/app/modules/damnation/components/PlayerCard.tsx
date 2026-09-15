"use client";

import { ChevronDown, GripVertical, Palette, Skull, Swords, X } from "lucide-react";
import { KeyboardEvent, useRef, useState } from "react";
import { COMMANDER_DAMAGE_LETHAL, isColorKey, NAME_MAX_LENGTH, PALETTE } from "../lib/constants";
import { eliminationReason } from "../lib/elimination";
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
  // Board only: a drag handle in the top-left corner. Arrow keys on it move the player too.
  onGripPointerDown?: (event: React.PointerEvent) => void;
  onGripKey?: (step: -1 | 1) => void;
  // Board only: the name and a color button become click-to-edit. Resolve true once saved.
  onRename?: (displayName: string) => Promise<boolean>;
  onRecolor?: (colorKey: string) => void;
  // Board only: shows an X in the top-right corner that removes the player (after a confirm).
  onRemove?: () => void;
  removeDisabled?: boolean;
}

// Short label in the card head (it shares the line with the name); the full reason is the tooltip.
const REASON_LABEL: Record<string, { short: string; full: string }> = {
  life: { short: "Out", full: "Out — no life" },
  commander_damage: { short: "Out", full: "Out — commander damage" },
  conceded: { short: "Conceded", full: "Conceded" },
  host: { short: "Out", full: "Marked out" },
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
  onRemove,
  removeDisabled = false,
  onGripPointerDown,
  onGripKey,
  onRename,
  onRecolor,
}: PlayerCardProps) {
  // INPUT
  const [nameDraft, setNameDraft] = useState("");

  // STATE
  const [showCommander, setShowCommander] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isPickingColor, setIsPickingColor] = useState(false);
  // Which tap zone is being pressed. Set from pointer events rather than relying on :active, which
  // mobile Safari doesn't apply to touches, and held briefly after release so a quick tap still
  // shows its flash.
  const [pressedZone, setPressedZone] = useState<"minus" | "plus" | null>(null);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pressHandlers = (zone: "minus" | "plus") => ({
    onPointerDown: () => {
      clearTimeout(releaseTimerRef.current);
      setPressedZone(zone);
    },
    onPointerUp: () => {
      releaseTimerRef.current = setTimeout(() => setPressedZone(null), 120);
    },
    onPointerLeave: () => setPressedZone(null),
    onPointerCancel: () => setPressedZone(null),
  });
  const pendingLife = overlay.life[player.id] ?? 0;
  const life = player.life_total + pendingLife;
  const seatClass = isColorKey(player.color_key) ? `dmn-seat-${player.color_key}` : "dmn-seat-artifact";
  const opponents = players.filter((other) => other.id !== player.id);

  // Commander damage this player has taken, per source, including taps still in flight.
  const damageFrom = (sourceId: string) => {
    const stored = cells.find((cell) => cell.source_player_id === sourceId && cell.target_player_id === player.id)?.damage ?? 0;
    return Math.max(0, stored + (overlay.commander[`${player.id}:${sourceId}`] ?? 0));
  };
  // Out or not, decided here from the totals on screen (pending taps included) so it shows at once.
  const pendingStatus = overlay.status[player.id] ?? {};
  const conceded = pendingStatus.conceded ?? player.conceded;
  const override = pendingStatus.eliminated_override !== undefined ? pendingStatus.eliminated_override : player.eliminated_override;
  // Every commander that has hit this player, including one whose player has since left.
  const damageSources = new Set([
    ...opponents.map((source) => source.id),
    ...cells.filter((cell) => cell.target_player_id === player.id).map((cell) => cell.source_player_id),
  ]);
  const outReason = eliminationReason(
    { eliminated_override: override, conceded, life_total: life },
    [...damageSources].map((sourceId) => damageFrom(sourceId))
  );
  const isOut = outReason !== null;

  async function commitName() {
    const trimmed = nameDraft.trim();
    if (!onRename || !trimmed || trimmed === player.display_name) {
      setIsEditingName(false);
      return;
    }
    // The new name shows at once (the board patches it in); a refused one (already taken) reopens
    // the field with the text.
    setIsEditingName(false);
    if (!(await onRename(trimmed))) {
      setNameDraft(trimmed);
      setIsEditingName(true);
    }
  }

  function onNameKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      // Drop the on-screen keyboard: Enter finishes the field.
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setIsEditingName(false);
    }
  }

  const damageChips = commanderDamage
    ? opponents.map((source) => ({ source, damage: damageFrom(source.id) })).filter((entry) => entry.damage > 0)
    : [];

  const cardClass = [
    "dmn-card",
    seatClass,
    variant === "self" ? "dmn-card-self" : "",
    variant === "board" ? "dmn-card-board" : "",
    isOut ? "dmn-card-out" : "",
    fill ? "flex-1" : "",
  ].join(" ");

  return (
    /* PLAYER CARD */
    <section className={cardClass} aria-label={`${player.display_name}, ${life} life`}>

      {/* CARD HEAD */}
      <div className="dmn-card-head">

        {/* GRIP */}
        {onGripPointerDown && (
          <button
            type="button"
            className="dmn-card-grip"
            onPointerDown={onGripPointerDown}
            onKeyDown={(event) => {
              const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : 0;
              if (step === 0 || !onGripKey) return;
              event.preventDefault();
              onGripKey(step);
            }}
            aria-label={`Move ${player.display_name}`}
            title="Drag onto another card to swap places"
          >
            <GripVertical className="w-4 h-4" aria-hidden />
          </button>
        )}

        {/* PRESENCE */}
        {connected !== null && (
          <span
            className={`dmn-presence ${connected ? "dmn-presence-on" : ""}`}
            title={connected ? "Phone connected" : "Phone not connected"}
            aria-label={connected ? "Phone connected" : "Phone not connected"}
          />
        )}

        {/* COLOR — board only; opens the palette over the card */}
        {onRecolor && (
          <button
            type="button"
            className="dmn-card-color"
            aria-expanded={isPickingColor}
            aria-label={`Change ${player.display_name}'s color`}
            title="Change color"
            onClick={() => setIsPickingColor((open) => !open)}
          >
            <Palette className="w-4 h-4" aria-hidden />
          </button>
        )}

        {/* NAME — guest-supplied, rendered as text only. On the board it reads as plain text and
            turns into a field when clicked. */}
        {onRename && isEditingName ? (
          <input
            autoFocus
            className="dmn-card-name dmn-card-name-input"
            value={nameDraft}
            maxLength={NAME_MAX_LENGTH}
            aria-label={`Rename ${player.display_name}`}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(event) => setNameDraft(event.target.value)}
            onKeyDown={onNameKey}
            onBlur={commitName}
          />
        ) : onRename ? (
          <button
            type="button"
            className="dmn-card-name dmn-card-name-button"
            title="Rename"
            onClick={() => {
              setNameDraft(player.display_name);
              setIsEditingName(true);
            }}
          >
            {player.display_name}
          </button>
        ) : (
          <span className="dmn-card-name">{player.display_name}</span>
        )}

        {/* TAGS */}
        {isMe && <span className="dmn-tag">You</span>}

        {/* ELIMINATION — in the head so a player going out doesn't push the card's contents down */}
        {outReason && (
          <span className="dmn-out-reason" title={REASON_LABEL[outReason].full} aria-label={REASON_LABEL[outReason].full}>
            <Skull className="w-4 h-4" aria-hidden /> {REASON_LABEL[outReason].short}
          </span>
        )}

        {/* REMOVE */}
        {onRemove && (
          <button
            type="button"
            className="dmn-card-remove"
            disabled={removeDisabled}
            onClick={onRemove}
            aria-label={`Remove ${player.display_name}`}
            title="Remove this player from the game"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>

      {/* PALETTE — over the card, so opening it doesn't move anything */}
      {onRecolor && isPickingColor && (
        <div className="dmn-card-palette" role="group" aria-label="Color">
          {PALETTE.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={`dmn-swatch dmn-seat-${entry.key}`}
              aria-pressed={player.color_key === entry.key}
              aria-label={entry.label}
              title={entry.label}
              onClick={() => {
                setIsPickingColor(false);
                if (entry.key !== player.color_key) onRecolor(entry.key);
              }}
            />
          ))}
        </div>
      )}

      {editable ? (
        /* LIFE — the two halves of the number are the ±1 buttons, the same on every card */
        <div className={`dmn-tap-zones ${fill ? "flex-1" : ""}`}>

          {/* LOSE ONE */}
          <button type="button" className="dmn-tap-zone dmn-tap-zone-minus" data-pressed={pressedZone === "minus"} {...pressHandlers("minus")} onClick={() => onLife(-1)} aria-label={`${player.display_name} lose 1 life`} title="Lose 1 life">
            <span className="dmn-tap-symbol" aria-hidden>−</span>
          </button>

          {/* GAIN ONE */}
          <button type="button" className="dmn-tap-zone dmn-tap-zone-plus" data-pressed={pressedZone === "plus"} {...pressHandlers("plus")} onClick={() => onLife(1)} aria-label={`${player.display_name} gain 1 life`} title="Gain 1 life">
            <span className="dmn-tap-symbol" aria-hidden>+</span>
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

      {/* COMMANDER DAMAGE + STATUS EDITOR */}
      {/* Shown on every editable card, even before anyone else joins (it holds the status controls
          too), so a card is the same height whoever else is at the table. */}
      {editable && (
        <div className="dmn-editor">
          {/* TOGGLE */}
          <button
            type="button"
            className="dmn-toggle"
            onClick={() => setShowCommander((open) => !open)}
            aria-expanded={showCommander}
          >
            {commanderDamage ? (
              <span>
                <span className="dmn-toggle-long">Commander damage taken</span>
                <span className="dmn-toggle-short">Cmdr damage</span>
              </span>
            ) : (
              <span>Status</span>
            )}
            <ChevronDown className="dmn-toggle-chevron w-4 h-4" aria-hidden />
          </button>

          {/* ROWS — one per opposing commander, then status. Always rendered so opening and closing
              can animate; inert while closed so nothing hidden can be tapped or focused. */}
          <div className="dmn-collapse" data-open={showCommander} inert={!showCommander}>
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
                {isOut ? (
                  <button type="button" className="dmn-step" onClick={() => onStatus({ conceded: false, eliminated_override: false })} title="Put this player back in the game">
                    Jump back in
                  </button>
                ) : (
                  /* OUT — one button for conceding or being knocked out */
                  <button type="button" className="dmn-step" onClick={() => onStatus({ eliminated_override: true })} title="Mark this player as out (conceded or knocked out)">
                    Out
                  </button>
                )}
                {override !== null && !isOut && (
                  <button type="button" className="dmn-step" onClick={() => onStatus({ eliminated_override: null })} title="Go back to deciding from life and commander damage">
                    Auto
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COMMANDER DAMAGE SUMMARY — under the toggle and only while it's closed (the open rows show the
          same numbers), so the first damage never pushes the rows being tapped */}
      {!showCommander && damageChips.length > 0 && (
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
    </section>
  );
}
