"use client";

/* Shared nutrient-band meter — the bar grammar used by BOTH the Nutrition
   overview (NutritionClient) and the food-detail breakdown (_diary.tsx
   FoodNutrientRow), so the two can never drift. A band carries an optional
   floor / target / ceiling; `value` is what's plotted against it (the day's
   consumption on the overview, a serving's contribution on a food detail). */

import type { ResolvedNutrientTarget } from "../../types/food";

// Color tokens — CSS custom properties only, no hardcoded colors.
const C = {
  text: "var(--color-primary)",
  textMuted: "var(--color-secondary)",
  textDim: "var(--color-gray)",
  cardEl: "var(--hover-bg)",
  good: "var(--fg-carb)",            // green — floor cleared / target met / in band
  amber: "var(--alert-yellow-text)", // under a floor (deficient)
  danger: "var(--alert-red-text)",   // over a ceiling (excess)
  program: "var(--color-secondary)", // program-override marker tint
};

/* ─── HEADROOM ───
   Where the top *bounding* marker sits on the track. Headroom (the gap to the
   right end) is reserved only to the extent that exceeding that marker matters:
   a ceiling gets the most (overage is the point), a lone floor the least (you
   just need to clear it; overshoot is unbounded-and-fine), a target in between. */
const CEILING_POS = 0.75;
const TARGET_POS = 0.8;
const FLOOR_POS = 0.88;

// A value plotted against an optional floor/target/ceiling band.
export interface NutrientBand {
  value: number;
  floor: number | null;
  target: number | null;
  ceiling: number | null;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// Whole numbers, except values under 1 keep one decimal so trace nutrients
// (copper 0.9, omega-3 0.1) don't collapse to 0/1; thousands-separated so a big
// sodium figure doesn't read as one run of digits.
export function fmtNutrient(n: number): string {
  if (n > 0 && n < 1) return n.toFixed(1);
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/* ─── ANALYSIS ───
   Reduce a band + value to: the top bounding marker (anchor) that sizes the
   axis, and the state that drives color. */
// over → past a ceiling (red). under → below a hard floor (amber, deficient).
// approaching → below a lone target, no floor cleared yet (neutral). limitGood →
// safely under a pure ceiling (neutral). good → floor cleared / target met / in
// band (green).
type RowState = "none" | "under" | "approaching" | "limitGood" | "good" | "over";

export function analyzeBand(band: NutrientBand): { hasBar: boolean; anchor: number; anchorPos: number; state: RowState } {
  const { floor, target, ceiling, value } = band;
  const anchor = ceiling ?? target ?? floor ?? null;
  if (anchor == null || anchor <= 0) return { hasBar: false, anchor: 0, anchorPos: 1, state: "none" };
  const anchorPos = ceiling != null ? CEILING_POS : target != null ? TARGET_POS : FLOOR_POS;

  let state: RowState;
  if (ceiling != null && value > ceiling) state = "over";        // past a hard ceiling
  else if (floor != null && value < floor) state = "under";      // below a hard floor
  else if (floor != null) state = "good";                        // floor cleared (band/floor)
  else if (target != null && value < target) state = "approaching"; // lone target, not met
  else if (ceiling != null) state = "limitGood";                 // pure limit, safely under
  else state = "good";                                            // lone target met
  return { hasBar: true, anchor, anchorPos, state };
}

// Top-line display (band text + percent + color) and whether to draw a bar.
export function bandDisplay(band: NutrientBand, unit: string): { targetText: string; pctText: string; pctColor: string; showBar: boolean } {
  const { floor, target, ceiling, value } = band;
  const a = analyzeBand(band);
  if (!a.hasBar) return { targetText: ` ${unit}`, pctText: "No Target", pctColor: C.textDim, showBar: false };

  // Band text shows the most informative form of the markers present.
  let targetText: string;
  if (floor != null && ceiling != null) targetText = ` / ${fmtNutrient(floor)}–${fmtNutrient(ceiling)} ${unit}`;
  else if (ceiling != null) targetText = ` / ${fmtNutrient(ceiling)} ${unit}`;
  else if (target != null) targetText = ` / ${fmtNutrient(target)} ${unit}`;
  else targetText = ` / ${fmtNutrient(floor as number)} ${unit}`;

  const pct = Math.round((value / a.anchor) * 100);
  const pctColor =
    a.state === "over" ? C.danger :
    a.state === "under" ? C.amber :
    a.state === "approaching" || a.state === "limitGood" ? C.textMuted :
    C.good;
  return { targetText, pctText: `${pct}%`, pctColor, showBar: true };
}

// True when a resolved band is a program override (vs the FDA default).
export function isProgramTarget(band: ResolvedNutrientTarget | undefined | null): boolean {
  return band?.source === "manual";
}

/* ─── PROGRAM-TARGET GLYPH ───
   A bullseye marking a band that's a program override (not the FDA default).
   Same symbol everywhere a floor/target/ceiling band is shown so the cue is
   consistent. Secondary tint so it reads as metadata, not an alert. */
export function ProgramTargetMark() {
  return (
    /* PROGRAM-TARGET GLYPH — concentric target (bullseye) */
    <svg width="13" height="13" viewBox="0 0 24 24" role="img" aria-label="Custom target set by your program" style={{ flexShrink: 0, color: C.program, stroke: C.program }}>
      <title>Custom target set by your program</title>
      <circle cx="12" cy="12" r="9" strokeWidth="2" fill="none" />
      <circle cx="12" cy="12" r="5" strokeWidth="2" fill="none" />
      <circle cx="12" cy="12" r="1.5" strokeWidth="0" fill="currentColor" />
    </svg>
  );
}

/* ─── METER ───
   A neutral track carrying the floor/target/ceiling markers, with `value` drawn
   as a thinner, accent-tinted fill framed by the track. A floor gets a caret
   above the track; the floor→ceiling (or floor→target) span gets a neutral
   good-zone band; a ceiling gets a hatched over-zone tail past it. */
export function NutrientMeter({ band, fillColor }: { band: NutrientBand; fillColor: string }) {
  const H = 11;          // full track height (the floor/ceiling range spans this)
  const FILL_H = 5;      // consumption fill — thinner, so the range frames it
  const inset = (H - FILL_H) / 2;
  const a = analyzeBand(band);
  if (!a.hasBar) return null;

  const domMax = a.anchor / a.anchorPos;
  const pos = (v: number) => clamp01(v / domMax) * 100;
  const floorPos = band.floor != null ? pos(band.floor) : null;
  const targetPos = band.target != null ? pos(band.target) : null;
  const ceilPos = band.ceiling != null ? pos(band.ceiling) : null;
  const fillPct = pos(band.value);

  // Green good-zone band: floor→ceiling, else floor→target.
  let bandL: number | null = null, bandR: number | null = null;
  if (floorPos != null && ceilPos != null) { bandL = floorPos; bandR = ceilPos; }
  else if (floorPos != null && targetPos != null) { bandL = floorPos; bandR = targetPos; }

  return (
    /* METER WRAPPER — reserves a row above the track for the floor caret */
    <div style={{ position: "relative", paddingTop: 6 }}>

      {/* TARGET CARET — downward triangle above the bar pointing at the target
          (the goal); only drawn when a target exists, so it reads as "aim for
          here". Floor/ceiling-only nutrients get no caret. */}
      {targetPos != null && (
        <div style={{ position: "absolute", left: `${targetPos}%`, top: 0, transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: `5px solid ${C.text}` }} />
      )}

      {/* TRACK */}
      <div style={{ position: "relative", height: H, background: C.cardEl, borderRadius: 999, overflow: "hidden" }}>

        {/* GOOD-ZONE BAND — neutral tint */}
        {bandL != null && bandR != null && (
          <div style={{ position: "absolute", left: `${bandL}%`, width: `${bandR - bandL}%`, top: 0, bottom: 0, background: `color-mix(in srgb, ${C.text} 13%, transparent)` }} />
        )}

        {/* OVER-ZONE — hatched tail past the ceiling */}
        {ceilPos != null && (
          <div style={{ position: "absolute", left: `${ceilPos}%`, right: 0, top: 0, bottom: 0, background: `repeating-linear-gradient(135deg, color-mix(in srgb, ${C.text} 14%, transparent) 0 3px, transparent 3px 6px)` }} />
        )}

        {/* FILL — thinner than the track, vertically centered + slightly
            translucent, so the range band + ticks peek above and below it */}
        <div style={{ position: "absolute", left: 0, top: inset, height: FILL_H, width: `${fillPct}%`, background: fillColor, opacity: 0.82, borderRadius: 999 }} />

        {/* FLOOR TICK — full-height, full-opacity, marks the minimum inside the track */}
        {floorPos != null && <div style={{ position: "absolute", left: `${floorPos}%`, top: -2, bottom: -2, width: 2, marginLeft: -1, background: C.text, borderRadius: 1 }} />}

        {/* TARGET TICK */}
        {targetPos != null && <div style={{ position: "absolute", left: `${targetPos}%`, top: -2, bottom: -2, width: 2.5, marginLeft: -1.25, background: C.text, borderRadius: 1 }} />}

        {/* CEILING TICK */}
        {ceilPos != null && <div style={{ position: "absolute", left: `${ceilPos}%`, top: -2, bottom: -2, width: 2, marginLeft: -1, background: C.text, borderRadius: 1, opacity: 0.85 }} />}
      </div>
    </div>
  );
}
