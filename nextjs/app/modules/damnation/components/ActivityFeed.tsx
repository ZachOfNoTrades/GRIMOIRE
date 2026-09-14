"use client";

import { ArrowDown, History } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { describeEvent, FEED_HIDDEN_EVENT_TYPES } from "../lib/describeEvent";
import type { EventView, PlayerView } from "../types/damnation";

// Within this many pixels of the bottom counts as "at the bottom", so a fractional scroll
// position or a one-line nudge doesn't unpin the feed.
const PIN_THRESHOLD_PX = 24;

// Recent changes at the table, oldest at the top and newest at the bottom. The list follows new
// activity while it is scrolled to the bottom; once someone scrolls up to read, it stays put and
// offers a jump back to the latest. Undone changes stay listed, struck through; housekeeping
// events (FEED_HIDDEN_EVENT_TYPES) aren't listed.
export default function ActivityFeed({
  events,
  players,
  formerPlayers,
}: {
  events: EventView[];
  players: PlayerView[];
  formerPlayers: { id: string; display_name: string }[];
}) {
  // STATE
  const listRef = useRef<HTMLOListElement>(null);
  const pinnedRef = useRef(true);
  const [isPinned, setIsPinned] = useState(true);
  const playersById = new Map<string, Pick<PlayerView, "display_name">>([
    ...formerPlayers.map((player) => [player.id, player] as const),
    ...players.map((player) => [player.id, player] as const),
  ]);
  // The snapshot lists events newest first.
  const shown = events.filter((event) => !FEED_HIDDEN_EVENT_TYPES.has(event.event_type));
  const chronological = [...shown].reverse();
  const newestId = shown[0]?.id;

  // Follow new activity only while pinned. Runs before paint, so the list never flashes at the
  // old position when a row is added.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && pinnedRef.current) list.scrollTop = list.scrollHeight;
  }, [newestId, shown.length]);

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    const pinned = list.scrollHeight - list.scrollTop - list.clientHeight <= PIN_THRESHOLD_PX;
    pinnedRef.current = pinned;
    setIsPinned(pinned);
  }

  function jumpToLatest() {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
    pinnedRef.current = true;
    setIsPinned(true);
  }

  if (shown.length === 0) {
    return (
      /* EMPTY FEED PLACEHOLDER — centered in whatever height the card has */
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-secondary">
        <History className="w-6 h-6" aria-hidden />
        <span>No activity</span>
      </div>
    );
  }

  return (
    /* FEED FRAME */
    <div className="dmn-feed-frame relative">

      {/* FEED */}
      <ol ref={listRef} className="dmn-feed" aria-label="Recent changes" onScroll={onScroll}>
        {chronological.map((event) => (
          <li key={event.id} className={`dmn-feed-item ${event.undone ? "dmn-feed-item-undone" : ""}`}>
            <span>{describeEvent(event, playersById)}</span>
            <time className="dmn-feed-time" dateTime={event.ts_created}>
              {new Date(event.ts_created).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </time>
          </li>
        ))}
      </ol>

      {/* JUMP TO LATEST — only while scrolled up */}
      {!isPinned && (
        <Button
          className="btn-off absolute bottom-0 right-0 z-10 text-xs px-2 py-1 gap-1"
          onClick={jumpToLatest}
          title="Jump to the latest activity"
          aria-label="Jump to the latest activity"
        >
          <ArrowDown className="w-3 h-3" aria-hidden /> Latest
        </Button>
      )}
    </div>
  );
}
