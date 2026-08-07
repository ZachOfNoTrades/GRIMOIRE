"use client";

import { useEffect, useRef, useState } from "react";

// How many task chips actually FIT in a day cell, measured from the rendered grid.
//
// Day cells stretch to fill the calendar's height, so the number of chips a cell can show depends on
// the viewport — 6 on a desktop row, 2 on a short phone. Rendering a fixed count and letting the
// cell's overflow deal with it slices the last chip in half or spills it past the bottom rule, which
// reads as a rendering bug. Every cell in a month grid is the same size and every chip is one line
// tall, so ONE measurement (the first chip list + the first chip) drives the whole grid.
//
// Reducing the count can't change the list's height (it's a flex child sized by the row), so this
// settles in one pass rather than oscillating.
export function useChipFit(deps: unknown[], fallback = 6) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(fallback);

  useEffect(() => {
    const root = gridRef.current;
    if (!root) return;
    let frame = 0;

    const measure = () => {
      const list = root.querySelector<HTMLElement>(".qcal-chips");
      const chip = root.querySelector<HTMLElement>(".qcal-chip");
      // No chips on screen yet (the completion overlay usually lands after first paint) — nothing
      // to measure against; the observers below re-run this as soon as one appears.
      if (!list || !chip) return;
      const gap = 1; // .qcal-chips row gap
      const chipHeight = chip.getBoundingClientRect().height + gap;
      // A 1px safety margin: chip height is a fractional, font-metric-derived number that differs
      // slightly between engines, and being one chip over spills past the cell's bottom rule.
      const available = list.getBoundingClientRect().height + gap - 1;
      if (chipHeight <= 0 || available <= 0) return;
      const next = Math.max(1, Math.floor(available / chipHeight));
      setFit((prev) => (prev === next ? prev : next));
    };

    // Coalesce bursts (a re-render can fire both observers) into one measurement per frame.
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    schedule();
    // Size changes (viewport, month with a different row count) AND content changes — the first
    // chips arrive well after mount, and without watching for them the fallback would stand.
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    const mutation = new MutationObserver(schedule);
    mutation.observe(root, { childList: true, subtree: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { gridRef, fit };
}
