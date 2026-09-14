import type { EventView, PlayerView } from "../types/damnation";

// Plain-text descriptions for the activity feed. Names are guest-supplied, so the result is
// only ever rendered as React text — never as HTML or markdown.

function signed(value: number): string {
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

export function describeEvent(event: EventView, playersById: Map<string, Pick<PlayerView, "display_name">>): string {
  const name = (id: string | null) => (id ? playersById.get(id)?.display_name ?? "A former player" : "Host");
  const actor = name(event.actor_player_id);
  const target = name(event.target_player_id);
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  // "Bob −5 life" rather than "Bob: Bob −5 life" when a player changes their own card.
  const selfChange = event.actor_player_id !== null && event.actor_player_id === event.target_player_id;
  const who = selfChange ? "" : `${actor}: `;

  switch (event.event_type) {
    case "join":
      return payload.manual ? `Host added ${target}` : `${actor} joined`;
    case "claim":
      return `${actor} rejoined`;
    case "life":
      return `${who}${target} ${signed(Number(payload.delta ?? 0))} life`;
    case "commander_damage": {
      const cell = Number(payload.cell_delta ?? 0);
      const source = name(String(payload.source_player_id ?? ""));
      return cell >= 0
        ? `${who}${source}'s commander dealt ${cell} to ${target}`
        : `${who}removed ${Math.abs(cell)} of ${source}'s commander damage from ${target}`;
    }
    case "status": {
      const to = (payload.to ?? {}) as { conceded?: boolean; eliminated_override?: boolean | null };
      if (to.eliminated_override === true) return `${who}${target} is out`;
      if (to.eliminated_override === false) return `${who}${target} is back in`;
      return to.conceded ? `${who}${target} conceded` : `${who}${target} un-conceded`;
    }
    case "undo":
      return selfChange ? `${actor} undid a change to their own card` : `${actor} undid a change to ${target}`;
    case "kick":
      return selfChange ? `${target} left the game` : `Host removed ${target}`;
    case "start":
      return "Joining closed — game on";
    case "reopen":
      return payload.resumed ? "Host resumed the game — players rejoin with the new code" : "Joining reopened";
    case "rotate_code":
      return "Host issued a new join code";
    case "end":
      return "Game over";
    default:
      return "Something changed";
  }
}
