"use client";

import { UserPlus } from "lucide-react";
import type { ReactNode } from "react";

// An open spot: waiting text and, on the board, a button that adds a player who has no phone
// straight away, with a placeholder name and a free color (the host clicks the name or color on
// the new card to change it).
//
// `sizer` is an invisible player card rendered underneath, so the spot is exactly as tall as the
// card that will replace it and adding a player doesn't move anything.
export default function OpenSpotTile({
  position,
  waitingText,
  disabled = false,
  isDropTarget = false,
  style,
  sizer,
  onAdd,
}: {
  // The spot's place on the board (1-based); a card dragged here moves into it.
  position: number;
  waitingText: string;
  disabled?: boolean;
  isDropTarget?: boolean;
  style?: React.CSSProperties;
  sizer?: ReactNode;
  onAdd?: () => void;
}) {
  return (
    /* OPEN SPOT */
    <div
      className={`dmn-slot dmn-empty-seat ${isDropTarget ? "dmn-drop-target" : ""}`}
      data-open-spot={position}
      style={sizer ? { ...style, position: "relative", padding: 0, justifyContent: "stretch", alignItems: "stretch" } : style}
    >

      {/* SIZER — the card this spot will hold, invisible and out of reach */}
      {sizer && (
        <div aria-hidden inert style={{ visibility: "hidden", display: "flex", flexDirection: "column", flex: 1, margin: -1 }}>
          {sizer}
        </div>
      )}

      {/* CONTENT */}
      <div
        className={sizer ? "dmn-empty-seat-content" : undefined}
        style={
          sizer
            ? { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem", padding: "1rem" }
            : { display: "contents" }
        }
      >

        {/* WAITING TEXT */}
        <span>{waitingText}</span>

        {/* ADD PLAYER */}
        {onAdd && (
          <button type="button" className="dmn-add-player" disabled={disabled} onClick={onAdd} title="Add a player to the table" aria-label="Add player">
            <UserPlus className="w-4 h-4" aria-hidden />
            <span className="dmn-add-player-label">Add player</span>
          </button>
        )}
      </div>
    </div>
  );
}
