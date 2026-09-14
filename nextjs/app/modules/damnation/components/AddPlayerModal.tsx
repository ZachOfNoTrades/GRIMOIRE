"use client";

import { FormEvent, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { NAME_MAX_LENGTH, PALETTE } from "../lib/constants";

// Board-side form for adding a player who has no phone. Same rules as a guest join: any color,
// unique name (re-checked by the server under the session lock).
export default function AddPlayerModal({
  isOpen,
  takenColors,
  isSaving,
  onCancel,
  onAdd,
}: {
  isOpen: boolean;
  takenColors: string[];
  isSaving: boolean;
  onCancel: () => void;
  onAdd: (displayName: string, colorKey: string) => void;
}) {
  // INPUT
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PALETTE[0].key);

  // STATE
  const canAdd = name.trim().length > 0 && !isSaving;

  // Fresh form each time it opens, preselecting a color nobody has yet (colors can be shared).
  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setColor(PALETTE.find((entry) => !takenColors.includes(entry.key))?.key ?? PALETTE[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canAdd) return;
    // Drop the on-screen keyboard: the form is done once Enter is pressed.
    (document.activeElement as HTMLElement | null)?.blur();
    onAdd(name.trim(), color);
  }

  return (
    /* ADD PLAYER MODAL — autofocuses the name: a name is the first and only required input */
    <Modal isOpen={isOpen} onClose={onCancel} title="Add a player">
      <form onSubmit={submit} className="flex flex-col gap-3">

        {/* NAME LABEL */}
        <label className="text-h2" htmlFor="dmn-add-name">Name</label>

        {/* NAME FIELD */}
        <input
          id="dmn-add-name"
          autoFocus
          className="input-field"
          value={name}
          maxLength={NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
          enterKeyHint="done"
        />

        {/* COLOR LABEL */}
        <div className="text-h2">Color</div>

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

        {/* HINT */}
        <p className="text-secondary">
          For someone playing without a phone. You change their card from the board, and anyone in the game can change it from
          their phone too.
        </p>

        {/* ACTIONS */}
        <div className="flex justify-end gap-2">
          <Button type="button" className="btn-off" onClick={onCancel}>Cancel</Button>
          <Button type="submit" className="btn-green" disabled={!canAdd}>{isSaving ? "Adding…" : "Add player"}</Button>
        </div>
      </form>
    </Modal>
  );
}
