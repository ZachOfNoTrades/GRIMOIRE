"use client";

import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { layoutsFor, SLOT_NAMES, type BoardLayout } from "../lib/boardLayouts";

// Board-side picker for the table layout. Each option previews its grid with numbered cells in
// board order, so the host can see which player lands where before choosing.

function Preview({ layout }: { layout: BoardLayout }) {
  return (
    /* LAYOUT PREVIEW */
    <div
      className="grid gap-1 w-full"
      style={{
        gridTemplateColumns: layout.columns,
        gridTemplateAreas: layout.areas.map((row) => `"${row}"`).join(" "),
        minHeight: "4.5rem",
      }}
      aria-hidden
    >
      {SLOT_NAMES.slice(0, layout.slots).map((slot, index) => (
        <div
          key={slot}
          className="dmn-empty-seat text-xs"
          style={{ gridArea: slot, minHeight: "1.5rem", padding: 0 }}
        >
          {index + 1}
        </div>
      ))}
    </div>
  );
}

export default function LayoutPicker({
  isOpen,
  playerCount,
  current,
  isSaving,
  onCancel,
  onPick,
}: {
  isOpen: boolean;
  playerCount: number;
  current: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onPick: (layoutKey: string | null) => void;
}) {
  const layouts = layoutsFor(playerCount);

  return (
    /* LAYOUT MODAL — no text input, so nothing to autofocus */
    <Modal isOpen={isOpen} onClose={onCancel} title="Table layout" wide>
      <div className="flex flex-col gap-3">

        {/* HINT */}
        <p className="text-secondary">
          Arrange the board like the table. Numbers show the order players fill it in; use Manage players to move
          someone.
        </p>

        {/* OPTIONS */}
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(10rem, 1fr))" }}>

          {/* AUTO */}
          <Button
            className={`${current === null ? "btn-blue" : "btn-off"} flex-col items-stretch text-left`}
            disabled={isSaving}
            onClick={() => onPick(null)}
            aria-pressed={current === null}
          >
            <span className="font-bold text-sm">Automatic</span>
            <span className="text-xs">Fits the screen</span>
          </Button>

          {/* PRESETS */}
          {layouts.map((layout) => (
            <Button
              key={layout.key}
              className={`${current === layout.key ? "btn-blue" : "btn-off"} flex-col items-stretch text-left`}
              disabled={isSaving}
              onClick={() => onPick(layout.key)}
              aria-pressed={current === layout.key}
              title={layout.label}
              aria-label={layout.label}
            >
              <Preview layout={layout} />
            </Button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
