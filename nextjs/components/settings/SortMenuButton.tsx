"use client";

import { useRef, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import PopoverMenu from "@/components/PopoverMenu";

// A sort control for a list: one quiet icon button naming the current order, opening a
// single-choice menu. The same shape as the oracle entry list's sort (ListControls) and
// the quest calendar's radio groups, on the app-wide PopoverMenu so it works outside a
// module's own stylesheet. Picking an order closes the menu.
export interface SortOption<T extends string> {
  value: T;
  label: string;
}

export default function SortMenuButton<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly SortOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={anchorRef} style={{ position: "relative", display: "flex", alignItems: "center", gridColumn: 1 }}>

      {/* BUTTON — borderless; the label is the order in force */}
      <button
        type="button"
        className="btn-link"
        style={{ gap: "0.3rem", padding: "0.25rem 0.4rem", fontSize: "0.8rem", minWidth: 0 }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        title="Change the order"
        onClick={() => setOpen((v) => !v)}
      >
        <ArrowDownUp className="w-3.5 h-3.5" aria-hidden />
        <span>{current.label}</span>
      </button>

      {/* MENU — one radio row per order */}
      <PopoverMenu open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} align="left">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="popover-item"
            role="menuitemradio"
            aria-checked={o.value === value}
            onClick={() => { onChange(o.value); setOpen(false); }}
          >
            <span className="popover-item-radio" />
            {o.label}
          </button>
        ))}
      </PopoverMenu>
    </div>
  );
}
