"use client";

import { UserPlus } from "lucide-react";

// An open spot on the board: waiting text, and under it a button that adds a player who has no
// phone straight away, with a placeholder name and a free color. The host then clicks the name or
// color on the new card to change it.
export default function OpenSpotTile({
  waitingText,
  disabled,
  style,
  onAdd,
}: {
  waitingText: string;
  disabled: boolean;
  style?: React.CSSProperties;
  onAdd: () => void;
}) {
  return (
    /* OPEN SPOT */
    <div className="dmn-empty-seat" style={style}>

      {/* WAITING TEXT */}
      <span>{waitingText}</span>

      {/* ADD PLAYER */}
      <button type="button" className="dmn-add-player" disabled={disabled} onClick={onAdd} title="Add a player who has no phone">
        <UserPlus className="w-4 h-4" aria-hidden /> Add player
      </button>
    </div>
  );
}
