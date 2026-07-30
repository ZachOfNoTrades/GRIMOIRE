"use client";

import { CSSProperties } from "react";

// A pill segmented control (two or more options) — the app-wide version of the
// switch that started life as the forage dashboard's Consumed / Remaining toggle.
// A grey track holds N equal-width options and a single filled indicator slides to
// the active one, so the inactive side reads as unselected. Every color resolves to
// a global design token (globals.css :root), so it tracks the app theme. Generic
// over the option value type so callers keep a strongly-typed union. Layout
// (margin/centering) is left to the caller via `style`.

// ONE SELECTABLE OPTION — its stable value plus the label shown on the pill.
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export default function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  className,
  style,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  style?: CSSProperties;
}) {
  // Which slot the sliding indicator sits over (fall back to the first if the
  // current value isn't in the list, so the indicator is never orphaned).
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    /* SEGMENTED TOGGLE */
    <div role="tablist" className={`segmented-toggle${className ? ` ${className}` : ""}`} style={style}>

      {/* SLIDING INDICATOR — the filled pill; one slot wide, translated to the active option */}
      <span
        className="segmented-toggle-indicator"
        aria-hidden="true"
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${activeIndex * 100}%)` }}
      />

      {options.map((option) => {
        const isActive = option.value === value;
        return (
          /* OPTION PILL — transparent; the indicator behind it provides the fill */
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            className="segmented-toggle-pill"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
