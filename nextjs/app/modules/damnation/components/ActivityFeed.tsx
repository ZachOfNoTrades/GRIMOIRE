"use client";

import { describeEvent } from "../lib/describeEvent";
import type { EventView, PlayerView } from "../types/damnation";

// Recent changes at the table, newest first. Undone changes stay listed, struck through.
export default function ActivityFeed({
  events,
  players,
  formerPlayers,
}: {
  events: EventView[];
  players: PlayerView[];
  formerPlayers: { id: string; display_name: string }[];
}) {
  const playersById = new Map<string, Pick<PlayerView, "display_name">>([
    ...formerPlayers.map((player) => [player.id, player] as const),
    ...players.map((player) => [player.id, player] as const),
  ]);

  if (events.length === 0) {
    return (
      /* EMPTY FEED PLACEHOLDER */
      <p className="text-secondary">Nothing has happened yet.</p>
    );
  }

  return (
    /* FEED */
    <ol className="dmn-feed" aria-label="Recent changes">
      {events.map((event) => (
        <li key={event.id} className={`dmn-feed-item ${event.undone ? "dmn-feed-item-undone" : ""}`}>
          <span>{describeEvent(event, playersById)}</span>
          <time className="dmn-feed-time" dateTime={event.ts_created}>
            {new Date(event.ts_created).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </time>
        </li>
      ))}
    </ol>
  );
}
