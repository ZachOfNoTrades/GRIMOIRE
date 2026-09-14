"use client";

import { KeyboardEvent, useState } from "react";
import { NAME_MAX_LENGTH, PALETTE } from "../lib/constants";

// An open spot on the board. Besides the waiting text it holds two click-to-edit fields for
// adding a player who has no phone: a color and a name. Both read as plain text until clicked.
// The player is added when the name is committed (Enter, or leaving the field with a name typed).
export default function OpenSpotTile({
  waitingText,
  takenColors,
  disabled,
  style,
  onAdd,
}: {
  waitingText: string;
  takenColors: string[];
  disabled: boolean;
  style?: React.CSSProperties;
  onAdd: (displayName: string, colorKey: string) => Promise<boolean>;
}) {
  // INPUT
  const [name, setName] = useState("");
  const [pickedColor, setPickedColor] = useState<string | null>(null);

  // STATE
  const [isEditingName, setIsEditingName] = useState(false);
  const [isPickingColor, setIsPickingColor] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Until someone picks, suggest a color nobody has yet (colors can still be shared).
  const color = pickedColor ?? PALETTE.find((entry) => !takenColors.includes(entry.key))?.key ?? PALETTE[0].key;
  const colorLabel = PALETTE.find((entry) => entry.key === color)?.label ?? color;

  async function commit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setIsEditingName(false);
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    const added = await onAdd(trimmed, color);
    setIsSaving(false);
    if (added) {
      setName("");
      setPickedColor(null);
      setIsEditingName(false);
    }
  }

  function onNameKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      // Drop the on-screen keyboard: Enter finishes the field.
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setName("");
      setIsEditingName(false);
    }
  }

  return (
    /* OPEN SPOT */
    <div className="dmn-empty-seat" style={style}>

      {/* WAITING TEXT */}
      <span>{waitingText}</span>

      {/* ADD A PLAYER WITHOUT A PHONE */}
      <div className="dmn-inline-player">

        {/* COLOR — a swatch; clicking it opens the palette in place */}
        <button
          type="button"
          className={`dmn-inline-swatch dmn-seat-${color}`}
          disabled={disabled || isSaving}
          aria-expanded={isPickingColor}
          aria-label={`Color: ${colorLabel}`}
          title={`Color: ${colorLabel}`}
          // Keep focus in the name field, so picking a color mid-name doesn't commit the name.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setIsPickingColor((open) => !open)}
        />

        {/* NAME — plain text until clicked */}
        {isEditingName ? (
          <input
            autoFocus
            className="dmn-inline-input"
            value={name}
            maxLength={NAME_MAX_LENGTH}
            placeholder="Name"
            aria-label="New player name"
            autoComplete="off"
            enterKeyHint="done"
            readOnly={isSaving}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={onNameKey}
            onBlur={commit}
          />
        ) : (
          <button
            type="button"
            className="dmn-inline-text"
            disabled={disabled}
            onClick={() => setIsEditingName(true)}
            title="Add a player who has no phone"
          >
            Add player
          </button>
        )}
      </div>

      {/* PALETTE */}
      {isPickingColor && (
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Color">
          {PALETTE.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={`dmn-swatch dmn-inline-palette dmn-seat-${entry.key}`}
              aria-pressed={color === entry.key}
              aria-label={entry.label}
              title={entry.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setPickedColor(entry.key);
                setIsPickingColor(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
