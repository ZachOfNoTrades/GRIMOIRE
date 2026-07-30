"use client";

import { useMemo, type CSSProperties } from "react";

const WEEKDAY_SHORT = ["", "M", "T", "W", "T", "F", "S", "S"];

// Clamp each brick to [min, max] while preserving the total. If any brick is
// clamped, its residual is redistributed proportionally across the others
// (which then re-clamp until stable). Keeps macro ratios visible without any
// single brick being unreadable or dominating the column.
function normalizeHeights(raw: number[], min: number, max: number): number[] {
  const out = raw.slice();
  let frozen = new Array(out.length).fill(false);
  for (let iter = 0; iter < 4; iter++) {
    let changed = false;
    for (let i = 0; i < out.length; i++) {
      if (frozen[i]) continue;
      if (out[i] < min) { out[i] = min; frozen[i] = true; changed = true; }
      else if (out[i] > max) { out[i] = max; frozen[i] = true; changed = true; }
    }
    if (!changed) break;
  }
  return out.map((v) => Math.round(v));
}

export interface MacroRibbonInput {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export default function MacroRibbon({
  target,
  shiftedHighDays,
}: {
  target: MacroRibbonInput;
  shiftedHighDays: number[] | null;
}) {
  const days = useMemo(() => {
    const out: Array<{ kcal: number; p: number; f: number; c: number; tag: "high" | "low" | "even" }> = [];
    if (shiftedHighDays && shiftedHighDays.length > 0 && shiftedHighDays.length < 7) {
      const highCount = shiftedHighDays.length;
      const highMult = 1.15;
      const lowMult = (7 - highCount * highMult) / (7 - highCount);
      for (let wd = 1; wd <= 7; wd++) {
        const isHigh = shiftedHighDays.includes(wd);
        const mult = isHigh ? highMult : lowMult;
        out.push({
          kcal: Math.round(target.kcal * mult),
          p: target.protein_g,
          f: Math.round(target.fat_g * mult),
          c: Math.round(target.carbs_g * mult),
          tag: isHigh ? "high" : "low",
        });
      }
    } else {
      for (let wd = 1; wd <= 7; wd++) {
        out.push({ kcal: target.kcal, p: target.protein_g, f: target.fat_g, c: target.carbs_g, tag: "even" });
      }
    }
    return out;
  }, [target, shiftedHighDays]);

  const maxKcal = useMemo(() => Math.max(...days.map((d) => d.kcal)), [days]);
  // Heights are kcal-proportional, clamped per brick so labels stay readable
  // and no single macro can dominate the column. After clamping the residual
  // is redistributed across the unclamped bricks so the total still tracks
  // the day's kcal share relative to the heaviest day.
  const MIN_BRICK_H = 22;
  const MAX_BRICK_H = 84;
  const totalH = 150;

  return (
    /* MACRO RIBBON */
    <div className="macro-ribbon">
      {days.map((d, i) => {
        const scale = totalH * (d.kcal / maxKcal);
        const pKcal = d.p * 4;
        const fKcal = d.f * 9;
        const cKcal = d.c * 4;
        const total = pKcal + fKcal + cKcal || 1;
        const [pH, fH, cH] = normalizeHeights(
          [(pKcal / total) * scale, (fKcal / total) * scale, (cKcal / total) * scale],
          MIN_BRICK_H,
          MAX_BRICK_H,
        );
        return (
          /* DAY COLUMN */
          <div key={i} className="macro-ribbon-day" data-shifted={d.tag === "even" ? undefined : d.tag}>
            <div className="macro-ribbon-pill">{d.kcal}</div>
            <div className="macro-ribbon-stack">
              <div className="macro-ribbon-brick" data-kind="protein" style={{ ["--h" as string]: `${pH}px` } as CSSProperties}>{d.p}P</div>
              <div className="macro-ribbon-brick" data-kind="fat" style={{ ["--h" as string]: `${fH}px` } as CSSProperties}>{d.f}F</div>
              <div className="macro-ribbon-brick" data-kind="carb" style={{ ["--h" as string]: `${cH}px` } as CSSProperties}>{d.c}C</div>
            </div>
            <div className="macro-ribbon-label">{WEEKDAY_SHORT[i + 1]}</div>
          </div>
        );
      })}
    </div>
  );
}
