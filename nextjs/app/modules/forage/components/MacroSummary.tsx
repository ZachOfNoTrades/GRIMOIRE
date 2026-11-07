"use client";

import type { ReactNode } from "react";

interface MacroSummaryProps {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  control?: ReactNode; // sits beside the calories, such as a scope toggle
}

// Show calories over a bar splitting the energy between protein, fat and carbs, with each macro's grams and share below
export function MacroSummary({ kcal, protein, fat, carbs, control }: MacroSummaryProps) {
  const proteinKcal = protein * 4;
  const fatKcal = fat * 9;
  const carbKcal = carbs * 4;
  const macroKcal = proteinKcal + fatKcal + carbKcal;
  const shareOf = (part: number) => (macroKcal > 0 ? Math.round((part / macroKcal) * 100) : 0);
  const macros = [
    { kind: "protein", label: "Protein", grams: protein, share: shareOf(proteinKcal) },
    { kind: "fat", label: "Fat", grams: fat, share: shareOf(fatKcal) },
    { kind: "carb", label: "Carbs", grams: carbs, share: shareOf(carbKcal) },
  ];

  return (

    // MACRO SUMMARY
    <section className="macro-summary">

      {/* CALORIES ROW */}
      <div className="macro-summary-head">

        {/* CALORIES */}
        <div className="macro-summary-kcal">
          <span className="macro-summary-kcal-value">{Math.round(kcal)}</span>
          <span className="macro-summary-kcal-unit">kcal</span>
        </div>

        {/* CONTROL */}
        {control}
      </div>

      {/* MACRO BAR */}
      <div className="macro-bar" aria-hidden>
        {macros.map((macro) => (
          <span key={macro.kind} data-kind={macro.kind} style={{ width: `${macro.share}%` }} />
        ))}
      </div>

      {/* MACRO LEGEND */}
      <div className="macro-legend">
        {macros.map((macro) => (

          /* LEGEND ITEM */
          <span key={macro.kind} className="macro-legend-item">
            <span className="macro-legend-dot" data-kind={macro.kind} aria-hidden />
            {macro.label} <b>{(Math.round(macro.grams * 10) / 10).toFixed(1)}g</b>
            <span className="macro-legend-share">{macro.share}%</span>
          </span>
        ))}
      </div>
    </section>
  );
}
