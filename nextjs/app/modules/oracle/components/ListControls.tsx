"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowDownUp, Check, ListFilter, X } from "lucide-react";
import type { ListFilterDef, ListSortDef } from "../lib/listFilters";

interface ListControlsProps<T, C> {
  sorts: readonly ListSortDef<T, C>[];
  sortValue: string;
  onSortChange: (value: string) => void;
  filters: readonly ListFilterDef<T, C>[];
  /** What each filter would leave given the other groups' picks: the number drawn. */
  counts: Record<string, number>;
  /** What each filter would leave on its own: whether it is worth offering at all. */
  baseCounts: Record<string, number>;
  active: readonly string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  context: C;
}

/** A menu anchored under its button. Escape or a press outside closes it and hands focus back. */
function MenuButton({ label, icon, isOn, children, title, after }: { label: string; icon: ReactNode; isOn?: boolean; title?: string; after?: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: Event) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); return; }
      // Arrow keys walk the menu, so the whole surface is reachable without a mouse at the table.
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemcheckbox']:not(:disabled), [role='menuitemradio']:not(:disabled)") ?? [])];
      if (items.length === 0) return;
      event.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length].focus();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="orc-list-anchor" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="orc-list-button"
        data-on={isOn ? "true" : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={title}
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
        <span className="orc-list-button-label">{label}</span>
      </button>
      {after}
      {open && (
        <div className="orc-context orc-list-menu" id={menuId} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// The entry list's sort and filter controls. Everything is driven by the definitions handed in,
// so adding a filter is one entry in that array and nothing here changes.
//
// At rest the row is a single line of two quiet buttons: the DM is looking at the map, not at
// this. Picking a filter adds a chip to the row, so what is narrowing the list is always on
// screen rather than hidden inside a closed menu.
export default function ListControls<T, C>({ sorts, sortValue, onSortChange, filters, counts, baseCounts, active, onToggle, onClear, context }: ListControlsProps<T, C>) {
  const sort = sorts.find((entry) => entry.value === sortValue) ?? sorts[0];

  // A filter is offered when it could ever match something, measured on its own rather than
  // against the current picks: one that is empty only because of what is already picked is
  // still drawn, showing 0, so a dead end stays visible instead of silently disappearing.
  const offered = filters.filter((filter) => active.includes(filter.id) || (!filter.unavailable?.(context) && (baseCounts[filter.id] ?? 0) > 0));
  const isDeadEnd = (filter: ListFilterDef<T, C>) => !active.includes(filter.id) && ((counts[filter.id] ?? 0) === 0 || !!filter.unavailable?.(context));

  // Sections keep their declared order; a filter with no section is listed on its own.
  const sections: { key: string; label: string | null; items: ListFilterDef<T, C>[] }[] = [];
  for (const filter of offered) {
    const key = filter.section ?? `#${filter.id}`;
    const found = sections.find((section) => section.key === key);
    if (found) found.items.push(filter);
    else sections.push({ key, label: filter.section ?? null, items: [filter] });
  }

  const chips = offered.filter((filter) => active.includes(filter.id));

  return (
    // CONTROLS
    <div className="orc-list-wrap">

      {/* SORT AND FILTER */}
      <div className="orc-list-bar">

      {/* SORT */}
      <MenuButton label={sort?.label ?? "Sort"} icon={<ArrowDownUp className="w-3.5 h-3.5" aria-hidden />} title="Change the order">
        {(close) => sorts.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="menuitemradio"
            aria-checked={entry.value === sortValue}
            className="orc-context-item orc-list-item"
            onClick={() => { onSortChange(entry.value); close(); }}
          >
            <span className="orc-list-tick">{entry.value === sortValue && <Check className="w-3.5 h-3.5" aria-hidden />}</span>
            <span className="orc-grow">{entry.label}</span>
          </button>
        ))}
      </MenuButton>

      {/* FILTERS */}
      {offered.length > 0 && (
        <MenuButton
          label={chips.length === 0 ? "Filter" : chips.length === 1 ? chips[0].label : `${chips[0].label} +${chips.length - 1}`}
          icon={<ListFilter className="w-3.5 h-3.5" aria-hidden />}
          isOn={chips.length > 0}
          title={chips.length > 0 ? "Change what the list is narrowed to" : "Narrow the list"}
          after={chips.length > 0 ? <button type="button" className="orc-list-drop" title="Show everything again" aria-label="Show everything again" onClick={onClear}><X className="w-3.5 h-3.5" aria-hidden /></button> : null}
        >
          {() => sections.map((group) => (
            <div key={group.key} className="orc-list-group">
              {group.label && <p className="orc-list-group-name">{group.label}</p>}
              {group.items.map((filter) => {
                const isOn = active.includes(filter.id);
                return (
                  <button
                    key={filter.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={isOn}
                    disabled={isDeadEnd(filter)}
                    className="orc-context-item orc-list-item"
                    onClick={() => onToggle(filter.id)}
                  >
                    <span className="orc-list-tick">{isOn && <Check className="w-3.5 h-3.5" aria-hidden />}</span>
                    {filter.icon}
                    <span className="orc-grow">{filter.label}</span>
                    <span className="orc-list-count">{counts[filter.id] ?? 0}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </MenuButton>
      )}

      </div>

    </div>
  );
}
