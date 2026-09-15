import type { EventType, EventView, PlayerView } from "../types/damnation";

// Plain-text descriptions for the activity feed. Names are guest-supplied, so the result is
// only ever rendered as React text — never as HTML or markdown.

// Housekeeping the table doesn't need to read about: game setup, moving players around the board,
// name/color edits and new join codes. Still recorded (phones match their changes by op_id).
export const FEED_HIDDEN_EVENT_TYPES: ReadonlySet<EventType> = new Set<EventType>(["setup", "reorder", "edit_player", "rotate_code"]);

function signed(value: number): string {
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

// An activity feed entry: what happened, and the same with who did it ("Player 1 added" /
// "Player 1 added by Host") for the entry's tooltip. Things people do to themselves (joining, their
// own taps) have no separate doer.
export interface EventDescription {
  text: string;
  detail: string;
}

export function describeEvent(event: EventView, playersById: Map<string, Pick<PlayerView, "display_name">>): EventDescription {
  const name = (id: string | null) => (id ? playersById.get(id)?.display_name ?? "A former player" : "Host");
  const actor = name(event.actor_player_id);
  const target = name(event.target_player_id);
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const selfChange = event.actor_player_id !== null && event.actor_player_id === event.target_player_id;
  const by = (text: string) => ({ text, detail: `${text} by ${actor}` });
  const own = (text: string) => (selfChange ? { text, detail: text } : by(text));

  switch (event.event_type) {
    case "join":
      if (payload.manual) return by(`${target} added`);
      return { text: `${actor} joined`, detail: `${actor} joined` };
    case "claim":
      return { text: `${actor} rejoined`, detail: `${actor} rejoined` };
    case "life":
      return own(`${target} ${signed(Number(payload.delta ?? 0))} life`);
    case "commander_damage": {
      const cell = Number(payload.cell_delta ?? 0);
      const source = name(String(payload.source_player_id ?? ""));
      return own(
        cell >= 0
          ? `${source}'s commander dealt ${cell} to ${target}`
          : `${Math.abs(cell)} of ${source}'s commander damage removed from ${target}`
      );
    }
    case "status": {
      const to = (payload.to ?? {}) as { conceded?: boolean; eliminated_override?: boolean | null };
      if (to.eliminated_override === true) return own(`${target} is out`);
      if (to.eliminated_override === false) return own(`${target} is back in`);
      return own(to.conceded ? `${target} conceded` : `${target} un-conceded`);
    }
    case "undo":
      return own(`A change to ${target} undone`);
    case "kick":
      return selfChange ? { text: `${target} left the game`, detail: `${target} left the game` } : by(`${target} removed`);
    case "start":
      return by(payload.during_game ? "Lobby closed" : "Game started");
    case "reopen":
      return by(payload.resumed ? "Game resumed — players rejoin with the new code" : "Lobby opened");
    case "rotate_code":
      return by("New join code issued");
    case "end":
      return by("Game over");
    case "edit_player": {
      if (payload.display_name_from !== undefined) return by(`${String(payload.display_name_from)} renamed to ${target}`);
      return by(`${target}'s color changed`);
    }
    case "setup": {
      const parts: string[] = [];
      if (payload.starting_life !== undefined) parts.push(`Starting life set to ${Number(payload.starting_life)}`);
      if (payload.max_players !== undefined) parts.push(`${parts.length ? "the game" : "The game"} set to ${Number(payload.max_players)} players`);
      return by(parts.join(" and "));
    }
    case "reorder":
      // Events from before drag-to-swap recorded a direction instead of a partner.
      if (payload.to_position) return by(`${target} moved to an open spot on the board`);
      if (payload.with_player_id) return by(`${target} and ${name(String(payload.with_player_id))} swapped on the board`);
      return by(`${target} moved ${payload.direction === "earlier" ? "earlier" : "later"} on the board`);
    default:
      return { text: "Something changed", detail: "Something changed" };
  }
}
