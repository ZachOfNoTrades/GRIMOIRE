"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export interface ListSortOption<T extends string> {
  value: T;
  label: string;
}

export interface ListFilterDef {
  id: string;
  label: string;
  activeLabel?: string;
  icon?: ReactNode;
  activeIcon?: ReactNode;
  count: number;
}

interface ListControlsProps<T extends string> {
  sortOptions: readonly ListSortOption<T>[];
  sortKey: T;
  onSortChange: (value: T) => void;
  sortLabel: string;
  filters: readonly ListFilterDef[];
  active: readonly string[];
  onToggle: (id: string) => void;
}

// Sort dropdown + filter chips on one wrapping line, following the Rune deck list: the
// dropdown takes the width and the chips ride the right edge. A filter whose count is 0 is
// not rendered, so an unused filter never sits on the row explaining itself.
export default function ListControls<T extends string>({ sortOptions, sortKey, onSortChange, sortLabel, filters, active, onToggle }: ListControlsProps<T>) {
  return (
    // CONTROLS ROW
    <div className="erow-filter-row orc-list-controls">

      {/* SORT SELECT */}
      <div className="erow-filter-select-wrap">
        <select
          className="input-field erow-filter-select"
          value={sortKey}
          onChange={(event) => onSortChange(event.target.value as T)}
          aria-label={sortLabel}
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <ChevronDown className="erow-filter-select-chev w-4 h-4" aria-hidden />
      </div>

      {/* FILTER CHIPS */}
      <div className="erow-filter-controls">
        {filters.filter((filter) => filter.count > 0).map((filter) => {
          const isOn = active.includes(filter.id);
          return (
            <button
              key={filter.id}
              type="button"
              className={`filter-chip ${isOn ? "filter-chip--active" : ""}`}
              onClick={() => onToggle(filter.id)}
              aria-pressed={isOn}
            >
              {(isOn ? filter.activeIcon : filter.icon) ?? filter.icon}
              {(isOn ? filter.activeLabel : filter.label) ?? filter.label}
              <span className="filter-chip-count">{filter.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
