"use client";

import { UserPlus } from "lucide-react";

// An open spot on the board: waiting text, and under it a button that adds a player who has no
// phone straight away, with a placeholder name and a free color. The host then clicks the name or
// color on the new card to change it.
export default function OpenSpotTile({
  position,
  waitingText,
  disabled,
  isDropTarget = false,
  style,
  onAdd,
}: {
  // The spot's place on the board (1-based); a card dragged here moves into it.
  position: number;
  waitingText: string;
  disabled: boolean;
  isDropTarget?: boolean;
  style?: React.CSSProperties;
  onAdd: () => void;
}) {
  return (
    /* OPEN SPOT */
    <div className={`dmn-empty-seat ${isDropTarget ? "dmn-drop-target" : ""}`} data-open-spot={position} style={style}>

      {/* WAITING TEXT */}
      <span>{waitingText}</span>

      {/* ADD PLAYER */}
      <button type="button" className="dmn-add-player" disabled={disabled} onClick={onAdd} title="Add a player who has no phone">
        <UserPlus className="w-4 h-4" aria-hidden /> Add player
      </button>
    </div>
  );
}
