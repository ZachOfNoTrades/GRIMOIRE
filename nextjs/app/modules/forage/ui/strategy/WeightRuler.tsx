"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const TICK_GAP_PX = 12;
const MAJOR_EVERY = 10;

export default function WeightRuler({
  value,
  onChange,
  min,
  max,
  absoluteMin,
  absoluteMax,
  unit = "lbs",
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  absoluteMin?: number;
  absoluteMax?: number;
  unit?: string;
}) {
  // STATE — the visible slider window. Seeded from props but can shift if the
  // user types a value outside the current window (recenters on the new value).
  const [winMin, setWinMin] = useState(min);
  const [winMax, setWinMax] = useState(max);

  // Re-seed the window if the upstream props change (e.g. current weight loads)
  // and the current value still fits inside the new prop window.
  useEffect(() => {
    setWinMin((cur) => (value >= cur && value <= winMax ? Math.min(cur, min) : min));
    setWinMax((cur) => (value >= winMin && value <= cur ? Math.max(cur, max) : max));
    // We intentionally only run this when the prop bounds change, not value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [min, max]);

  const hardMin = absoluteMin ?? min;
  const hardMax = absoluteMax ?? max;

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const dragRef = useRef<{ active: boolean; startX: number; startValue: number }>({
    active: false,
    startX: 0,
    startValue: value,
  });

  // INPUT
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useLayoutEffect(() => {
    if (!trackRef.current) return;
    const el = trackRef.current;
    const update = () => setTrackWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Slider drag clamps to the CURRENT window. Typed entry uses the hard bounds
  // and recenters the window if needed.
  const clampToWindow = useCallback(
    (n: number) => Math.max(winMin, Math.min(winMax, n)),
    [winMin, winMax],
  );

  function commitTypedValue(raw: number) {
    if (!Number.isFinite(raw)) return;
    const clamped = Math.max(hardMin, Math.min(hardMax, Math.round(raw)));
    if (clamped < winMin || clamped > winMax) {
      // Recenter the window around the typed value, preserving its width
      const width = winMax - winMin;
      const halfWidth = Math.floor(width / 2);
      let newMin = clamped - halfWidth;
      let newMax = clamped + (width - halfWidth);
      if (newMin < hardMin) { newMin = hardMin; newMax = Math.min(hardMax, newMin + width); }
      if (newMax > hardMax) { newMax = hardMax; newMin = Math.max(hardMin, newMax - width); }
      setWinMin(newMin);
      setWinMax(newMax);
    }
    if (clamped !== value) onChange(clamped);
  }

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = { active: true, startX: e.clientX, startValue: value };
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [value],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.active) return;
      const dx = e.clientX - drag.startX;
      const delta = -dx / TICK_GAP_PX;
      const next = clampToWindow(Math.round(drag.startValue + delta));
      if (next !== value) onChange(next);
    },
    [clampToWindow, onChange, value],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current.active = false;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

  // Total tick count + offset that centers `value` on the cursor.
  const totalTicks = winMax - winMin + 1;
  const centerPx = trackWidth / 2;
  const offsetPx = centerPx - (value - winMin) * TICK_GAP_PX;

  // Render only the ticks currently visible (+ padding) for perf.
  const padTicks = 8;
  const firstVisible = Math.max(0, Math.floor((-offsetPx) / TICK_GAP_PX) - padTicks);
  const lastVisible = Math.min(totalTicks - 1, Math.ceil((trackWidth - offsetPx) / TICK_GAP_PX) + padTicks);

  // Keyboard support — only when the track itself has focus (not the input)
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); onChange(clampToWindow(value - 1)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); onChange(clampToWindow(value + 1)); }
      else if (e.key === "PageDown") { e.preventDefault(); onChange(clampToWindow(value - 10)); }
      else if (e.key === "PageUp") { e.preventDefault(); onChange(clampToWindow(value + 10)); }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [clampToWindow, onChange, value]);

  const ticks: React.ReactNode[] = [];
  for (let i = firstVisible; i <= lastVisible; i++) {
    const n = winMin + i;
    const major = n % MAJOR_EVERY === 0;
    ticks.push(
      /* TICK */
      <div
        key={i}
        className="weight-ruler-tick"
        data-major={major ? "true" : undefined}
        style={{ width: `${TICK_GAP_PX}px`, transform: `translateX(${i * TICK_GAP_PX}px)`, position: "absolute", left: 0, bottom: 0, height: "100%" }}
      >
        {major && <span className="weight-ruler-tick-label">{n}</span>}
        <div className="weight-ruler-tick-bar" />
      </div>,
    );
  }

  return (
    /* WEIGHT RULER */
    <div className="weight-ruler">
      {/* EDITABLE VALUE */}
      <div className="weight-ruler-value">
        <input
          className="weight-ruler-value-input"
          type="text"
          inputMode="numeric"
          aria-label={`Target weight in ${unit}`}
          value={editing ? draft : String(value)}
          onFocus={(e) => {
            setEditing(true);
            setDraft(String(value));
            e.currentTarget.select();
          }}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
          onBlur={() => {
            setEditing(false);
            const n = Number(draft);
            if (Number.isFinite(n) && n > 0) commitTypedValue(n);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            else if (e.key === "Escape") { setDraft(String(value)); (e.currentTarget as HTMLInputElement).blur(); }
          }}
        />
        <span className="weight-ruler-value-unit">{unit}</span>
      </div>

      {/* TRACK */}
      <div
        ref={trackRef}
        className="weight-ruler-track"
        role="slider"
        tabIndex={0}
        aria-valuemin={winMin}
        aria-valuemax={winMax}
        aria-valuenow={value}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* TICKS */}
        <div className="weight-ruler-ticks" style={{ transform: `translateX(${offsetPx}px)` }}>
          {ticks}
        </div>

        {/* CURSOR */}
        <div className="weight-ruler-cursor" />
      </div>
    </div>
  );
}
