"use client";

import { KeyboardEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_PLAYERS, MIN_PLAYERS, STARTING_LIFE_PRESETS } from "../lib/constants";

// Starting life and player count for a game, set on the board while joining is open. Each choice
// is saved as soon as it is made.

const PLAYER_COUNT_OPTIONS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, index) => MIN_PLAYERS + index);

export default function GameSetup({
  startingLife,
  maxPlayers,
  playerCount,
  disabled,
  onChange,
}: {
  startingLife: number;
  maxPlayers: number;
  playerCount: number;
  disabled: boolean;
  onChange: (change: { starting_life?: number; max_players?: number }) => Promise<boolean>;
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
    /* GAME SETUP — starting life and players side by side, wrapping under each other when narrow */
    <div className="flex flex-wrap gap-x-8 gap-y-3">

      {/* STARTING LIFE */}
      <div className="flex flex-col gap-2">

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
              title="Type a starting life"
            >
              {isPreset ? "Custom" : `Custom: ${startingLife}`}
            </Button>
          )}
        </div>
      </div>

      {/* PLAYER COUNT */}
      <div className="flex flex-col gap-2">

        {/* PLAYER COUNT LABEL */}
        <div className="text-h2">Players</div>

        {/* PLAYER COUNT PICKER — fewer than the players already in isn't offered */}
        <div className="flex flex-wrap gap-2">
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
        </div>
      </div>
    </div>
  );
}
