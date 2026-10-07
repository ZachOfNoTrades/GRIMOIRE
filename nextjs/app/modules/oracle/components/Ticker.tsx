"use client";

import { Image as ImageIcon, Pause, Pin, PinOff, Play, Sparkles } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { OracleChip } from "../types/oracle";
import DifficultyIcon, { chipContentDifficulty } from "./DifficultyIcon";

interface TickerProps {
  partyLevels: number[]; // the party's levels, for rating encounters
  chips: OracleChip[]; // banner order, oldest first; pinned ones are shown apart, at the front
  secondsPerChip: number;
  isPaused: boolean; // the DM paused the banner, or something is open over it
  isPreparing: boolean; // more items are being generated
  onTogglePause: () => void;
  onOpen: (chip: OracleChip) => void;
  onPin: (chip: OracleChip, isPinned: boolean) => void;
  onRecycle: (chipId: string) => void; // an item scrolled off the left edge: move it to the back
  onDiscard: (chipId: string) => void; // an item that cannot be shown (its picture will not load)
}

const GAP = 10;
// After a touch, the banner stays still this long so the item under the finger can be read.
const TOUCH_HOLD_MS = 4000;

// THE SUGGESTION BANNER — items scroll past like a news ticker, one new item per `secondsPerChip`.
//   - the pointer over the banner pauses it
//   - pointing at an item that is partly off the left edge slides everything right until it is whole
//   - an item that has fully left on the left goes to the back of the banner and comes round again
//   - pinned items do not scroll: they sit at the front until they are used
export default function Ticker({ partyLevels, chips, secondsPerChip, isPaused, isPreparing, onTogglePause, onOpen, onPin, onRecycle, onDiscard }: TickerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0); // how far the track has moved left, in px
  const hoverRef = useRef(false);
  const holdUntilRef = useRef(0);
  const droppedRef = useRef(new Map<string, number>()); // id -> width it occupied, for ids sent to the back
  const stateRef = useRef({ secondsPerChip, isPaused, onRecycle });
  stateRef.current = { secondsPerChip, isPaused, onRecycle };

  const pinned = chips.filter((chip) => chip.is_pinned);
  const moving = chips.filter((chip) => !chip.is_pinned);
  const movingKey = moving.map((chip) => chip.id).join(",");

  function applyOffset(snap: boolean) {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = snap ? "transform 180ms ease-out" : "none";
    track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;
  }

  // When an item that left on the left is moved to the back (or removed), the track gets shorter
  // on the left by that item's width. Taking the same amount off the offset in the same frame
  // keeps everything still.
  useLayoutEffect(() => {
    const position = new Map(moving.map((chip, index) => [chip.id, index]));
    for (const [id, width] of droppedRef.current) {
      const index = position.get(id);
      if (index === undefined || index > 0) {
        offsetRef.current = Math.max(0, offsetRef.current - width);
        droppedRef.current.delete(id);
      }
    }
    applyOffset(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movingKey]);

  // THE SCROLL LOOP — one animation frame at a time; speed is "one average item per interval".
  useEffect(() => {
    const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = performance.now();
    let stepTimer: ReturnType<typeof setInterval> | undefined;

    const firstMovable = () => {
      const track = trackRef.current;
      if (!track) return null;
      for (const child of Array.from(track.children) as HTMLElement[]) {
        if (child.dataset.chipId && !droppedRef.current.has(child.dataset.chipId)) return child;
      }
      return null;
    };

    const dropFirst = () => {
      const track = trackRef.current;
      const first = firstMovable();
      if (!track || !first?.dataset.chipId) return;
      // A lone item has nothing to go behind: start it over from the left instead.
      if (track.children.length - droppedRef.current.size <= 1) {
        offsetRef.current = 0;
        applyOffset(false);
        return;
      }
      droppedRef.current.set(first.dataset.chipId, first.offsetWidth + GAP);
      stateRef.current.onRecycle(first.dataset.chipId);
    };

    const stopped = () =>
      stateRef.current.isPaused || hoverRef.current || performance.now() < holdUntilRef.current || document.visibilityState !== "visible";

    if (reducedMotion) {
      // No continuous motion: the banner steps instead, dropping one item per interval.
      stepTimer = setInterval(() => {
        if (!stopped()) dropFirst();
      }, Math.max(stateRef.current.secondsPerChip, 5) * 1000);
      return () => clearInterval(stepTimer);
    }

    const tick = (now: number) => {
      const elapsed = Math.min(now - last, 100) / 1000; // a background tab must not cause a jump
      last = now;
      const track = trackRef.current;
      const viewport = viewportRef.current;
      if (track && viewport && !stopped()) {
        const count = track.children.length;
        const trackWidth = track.scrollWidth;
        // Only move while there is more banner to the right than the viewport shows; otherwise
        // wait for the next items instead of scrolling the banner empty.
        if (count > 0 && trackWidth - offsetRef.current > viewport.clientWidth) {
          offsetRef.current += (trackWidth / count / Math.max(stateRef.current.secondsPerChip, 1)) * elapsed;
          applyOffset(false);
          const first = firstMovable();
          if (first && first.offsetLeft + first.offsetWidth + GAP <= offsetRef.current) dropFirst();
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Pointing at an item that is cut off on the left slides the banner back until it is whole.
  function revealChip(element: HTMLElement) {
    if (element.offsetLeft < offsetRef.current) {
      offsetRef.current = element.offsetLeft;
      applyOffset(true);
    }
  }

  function renderChip(chip: OracleChip, isMoving: boolean) {
    const isImage = chip.content.type === "image";
    const difficulty = chipContentDifficulty(chip.content, partyLevels);
    return (
      // BANNER ITEM
      <div
        key={chip.id}
        className="orc-chip"
        data-chip-id={isMoving ? chip.id : undefined}
        data-kind={chip.content.type}
        data-pinned={chip.is_pinned ? "true" : undefined}
        onPointerEnter={isMoving ? (event) => revealChip(event.currentTarget) : undefined}
      >
        {/* OPEN BUTTON */}
        <button type="button" className="orc-chip-open" onClick={() => onOpen(chip)} title={chip.label}>
          {chip.content.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="orc-chip-thumb"
              src={chip.content.thumbnail}
              alt=""
              draggable={false}
              // A picture that will not load is no use as inspiration: remove the item for good.
              onError={() => onDiscard(chip.id)}
            />
          ) : null}
          {isImage ? <ImageIcon className="orc-chip-icon" aria-hidden /> : null}
          {difficulty && <DifficultyIcon difficulty={difficulty} />}
          <span className="orc-chip-label">{chip.label}</span>
        </button>

        {/* PIN BUTTON — appears on hover; on touch screens pinning is offered inside the opened item */}
        <button
          type="button"
          className="orc-chip-pin"
          onClick={() => onPin(chip, !chip.is_pinned)}
          title={chip.is_pinned ? "Unpin" : "Pin until used"}
          aria-label={chip.is_pinned ? `Unpin ${chip.label}` : `Pin ${chip.label} until used`}
        >
          {chip.is_pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
        </button>
      </div>
    );
  }

  // An empty banner was a strip of chrome saying it was empty, which on a phone cost a row of the
  // map to tell the DM nothing. It appears when there is something on it, or something coming.
  if (chips.length === 0 && !isPreparing) return null;

  return (
    // BANNER
    <div className="orc-ticker">

      {/* BANNER LABEL */}
      <div className="orc-ticker-label">
        <Sparkles className="w-4 h-4" aria-hidden />
        <span className="hidden sm:inline">Ideas</span>
      </div>

      {/* PAUSE BUTTON */}
      <button
        type="button"
        className="btn btn-link orc-ticker-pause"
        onClick={onTogglePause}
        title={isPaused ? "Resume the banner" : "Pause the banner"}
        aria-label={isPaused ? "Resume the banner" : "Pause the banner"}
      >
        {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
      </button>

      {/* PINNED ITEMS — fixed at the front */}
      {pinned.length > 0 && <div className="orc-ticker-pinned">{pinned.map((chip) => renderChip(chip, false))}</div>}

      {/* SCROLLING VIEWPORT */}
      <div
        ref={viewportRef}
        className="orc-ticker-viewport"
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") hoverRef.current = true;
        }}
        onPointerLeave={() => {
          hoverRef.current = false;
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") holdUntilRef.current = performance.now() + TOUCH_HOLD_MS;
        }}
      >
        {/* TRACK */}
        <div ref={trackRef} className="orc-ticker-track" style={{ gap: GAP }}>
          {moving.map((chip) => renderChip(chip, true))}
        </div>

        {/* EMPTY PLACEHOLDER */}
        {moving.length === 0 && (
          <p className="orc-ticker-empty">{isPreparing ? "Preparing ideas…" : "Banner paused"}</p>
        )}
      </div>
    </div>
  );
}
