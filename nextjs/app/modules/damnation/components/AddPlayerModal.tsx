"use client";

import { FormEvent, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { NAME_MAX_LENGTH, PALETTE } from "../lib/constants";

// Board-side form for seating a player who has no phone. Same name and colour rules as a guest
// join; the server re-checks both under the session lock.
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
  const [color, setColor] = useState<string | null>(null);

  // STATE
  const canAdd = name.trim().length > 0 && !!color && !takenColors.includes(color) && !isSaving;

  // Fresh form each time it opens, preselecting the first free colour.
  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setColor(PALETTE.find((entry) => !takenColors.includes(entry.key))?.key ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canAdd) return;
    // Drop the on-screen keyboard: the form is done once Enter is pressed.
    (document.activeElement as HTMLElement | null)?.blur();
    onAdd(name.trim(), color!);
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

        {/* COLOUR LABEL */}
        <div className="text-h2">Colour</div>

        {/* COLOUR PICKER */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Colour">
          {PALETTE.map((entry) => {
            const taken = takenColors.includes(entry.key);
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

        {/* HINT */}
        <p className="text-secondary">
          For someone playing without a phone. You change their card from the board, and anyone seated can change it from
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
