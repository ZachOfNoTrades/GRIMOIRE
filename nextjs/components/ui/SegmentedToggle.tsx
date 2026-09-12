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

// WHICH ARIA PATTERN THE TRACK ANNOUNCES — "tabs" (the default) for a control that
// switches which view is on screen, "radio" for a control that *sets a value* (a
// preference like the theme picker). Same visuals either way; only the roles and
// the selected-state attribute differ, which is what a screen reader reads out.
export type SegmentedA11y = "tabs" | "radio";

export default function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  className,
  style,
  a11y = "tabs",
  ariaLabel,
  disabled = false,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  style?: CSSProperties;
  // Blocks input while a change is being saved. No dimming: a save is a single
  // round trip, and fading the whole control for it reads as a glitch.
  disabled?: boolean;
  a11y?: SegmentedA11y;
  ariaLabel?: string;
}) {
  // Which slot the sliding indicator sits over (fall back to the first if the
  // current value isn't in the list, so the indicator is never orphaned).
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    /* SEGMENTED TOGGLE */
    <div
      role={a11y === "radio" ? "radiogroup" : "tablist"}
      aria-label={ariaLabel}
      className={`segmented-toggle${className ? ` ${className}` : ""}`}
      style={style}
    >

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
            role={a11y === "radio" ? "radio" : "tab"}
            {...(a11y === "radio" ? { "aria-checked": isActive } : { "aria-selected": isActive })}
            className="segmented-toggle-pill"
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
