"use client";

import { LayoutGrid } from "lucide-react";
import { KeyboardEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_PLAYERS, MIN_PLAYERS, STARTING_LIFE_PRESETS } from "../lib/constants";

// Starting life, player count, commander damage and guest player management for a game, set on the board's game card before
// the game and from Game Setup during it. Each choice is saved as soon as it is made.

const PLAYER_COUNT_OPTIONS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, index) => MIN_PLAYERS + index);

export default function GameSetup({
  startingLife,
  maxPlayers,
  playerCount,
  disabled,
  onChange,
  onOpenLayout,
  commanderDamage,
  onCommanderDamageChange,
  guestsManagePlayers,
  onGuestsManagePlayersChange,
}: {
  startingLife: number;
  maxPlayers: number;
  playerCount: number;
  disabled: boolean;
  onChange: (change: { starting_life?: number; max_players?: number }) => Promise<boolean>;
  // Opens the table layout picker; its button sits beside the player count.
  onOpenLayout: () => void;
  // This game's commander damage tracking (the Damnation setting is only the default for new games).
  commanderDamage: boolean;
  onCommanderDamageChange: (enabled: boolean) => void;
  // Whether players on their phones may add, rename, recolor, move and remove players.
  guestsManagePlayers: boolean;
  onGuestsManagePlayersChange: (enabled: boolean) => void;
}) {
  // INPUT
  const [customLife, setCustomLife] = useState("");

  // STATE
  const [isEditingCustom, setIsEditingCustom] = useState(false);
  const isPreset = STARTING_LIFE_PRESETS.includes(startingLife as (typeof STARTING_LIFE_PRESETS)[number]);

  async function commitCustom() {
    const life = Number.parseInt(customLife, 10);
    setIsEditingCustom(false);
    if (!Number.isInteger(life) || life === startingLife) return;
    await onChange({ starting_life: life });
  }

  function onCustomKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      // Drop the on-screen keyboard: Enter finishes the field.
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setCustomLife("");
      setIsEditingCustom(false);
    }
  }

  return (
    /* GAME SETUP — starting life and players side by side, wrapping under each other when narrow.
       Each label sits left of its buttons to keep the join panel short. */
    <div className="dmn-setup flex flex-wrap gap-x-8">

      {/* STARTING LIFE */}
      <div className="dmn-setup-group flex flex-wrap items-center gap-x-3 gap-y-2">

        {/* STARTING LIFE LABEL */}
        <div className="text-h2">Starting life</div>

        {/* STARTING LIFE PICKER */}
        <div className="flex flex-wrap items-center gap-2">
          {STARTING_LIFE_PRESETS.map((preset) => (
            <Button
              key={preset}
              className={startingLife === preset ? "btn-blue" : "btn-off"}
              disabled={disabled}
              onClick={() => startingLife !== preset && onChange({ starting_life: preset })}
              aria-pressed={startingLife === preset}
            >
              {preset}
            </Button>
          ))}

          {/* CUSTOM — a button until clicked, then a number field (autofocused: typing is next) */}
          {isEditingCustom ? (
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              className="input-field max-w-[7rem]"
              placeholder="e.g. 25"
              value={customLife}
              onChange={(event) => setCustomLife(event.target.value)}
              onKeyDown={onCustomKey}
              onBlur={commitCustom}
              aria-label="Custom starting life"
              enterKeyHint="done"
            />
          ) : (
            <Button
              className={isPreset ? "btn-off" : "btn-blue"}
              disabled={disabled}
              onClick={() => {
                setCustomLife(isPreset ? "" : String(startingLife));
                setIsEditingCustom(true);
              }}
              aria-pressed={!isPreset}
              title="Enter a custom starting life value"
            >
              {isPreset ? "Custom" : `Custom: ${startingLife}`}
            </Button>
          )}
        </div>
      </div>

      {/* PLAYER COUNT */}
      <div className="dmn-setup-group flex flex-wrap items-center gap-x-3 gap-y-2">

        {/* PLAYER COUNT LABEL */}
        <div className="text-h2">Players</div>

        {/* PLAYER COUNT PICKER — fewer than the players already in isn't offered */}
        <div className="dmn-player-count flex flex-wrap gap-2">
          {PLAYER_COUNT_OPTIONS.map((count) => (
            <Button
              key={count}
              className={maxPlayers === count ? "btn-blue" : "btn-off"}
              disabled={disabled || count < playerCount}
              onClick={() => maxPlayers !== count && onChange({ max_players: count })}
              aria-pressed={maxPlayers === count}
              title={count < playerCount ? `${playerCount} players are already in` : undefined}
            >
              {count}
            </Button>
          ))}

          {/* TABLE LAYOUT — icon only, in line with the counts it depends on */}
          <Button className="btn-off" onClick={onOpenLayout} title="Change the players' table layout" aria-label="Table layout">
            <LayoutGrid className="w-4 h-4" aria-hidden />
          </Button>
        </div>
      </div>

      {/* SWITCHES — commander damage and guest player management, one group */}
      <div className="dmn-setup-switches">
        {/* COMMANDER DAMAGE — the shared settings switch, driven by aria-checked on the row */}
        <button
          type="button"
          role="switch"
          className="dmn-setup-switch"
          aria-checked={commanderDamage}
          disabled={disabled}
          onClick={() => onCommanderDamageChange(!commanderDamage)}
          title="Track commander damage in this game"
        >
          <span className="text-h2">Commander damage</span>
          <span className="settings-switch" aria-hidden />
        </button>

        {/* GUESTS MANAGE PLAYERS — phones get the board's add, rename, recolor, move and remove */}
        <button
          type="button"
          role="switch"
          className="dmn-setup-switch"
          aria-checked={guestsManagePlayers}
          disabled={disabled}
          onClick={() => onGuestsManagePlayersChange(!guestsManagePlayers)}
          title="Allow guests who joined from a code to add and manage players"
        >
          <span className="text-h2">Guests manage players</span>
          <span className="settings-switch" aria-hidden />
        </button>
      </div>
    </div>
  );
}
