"use client";

import { DateRangeOption, DateRangePreset } from "@/lib/dateRange";

interface DateRangeSelectorProps {
  // Which presets this surface offers, in display order — see dateRangeOptions().
  options: DateRangeOption[];
  range: DateRangePreset;
  customStartDate: string;
  customEndDate: string;
  onRangeChange: (range: DateRangePreset) => void;
  onCustomDateChange: (startDate: string, endDate: string) => void;
  // Accessible name for the segmented group; say what the range scopes.
  label?: string;
}

// DATE RANGE SELECTOR — the app's date filter: a full-width segmented control
// (every preset visible, one tap to switch) with a pair of date inputs revealed
// below when "Custom" is active. Shared by forage's nutrition pages and rune's
// deck study history; each caller supplies its own preset list.
export default function DateRangeSelector({
  options,
  range,
  customStartDate,
  customEndDate,
  onRangeChange,
  onCustomDateChange,
  label = "Date range",
}: DateRangeSelectorProps) {

  // Picking one end drags the other along instead of being blocked by it. The
  // inputs used to bound each other with min/max, which the native Android date
  // picker enforces by GREYING OUT every day past the other end — so a user on a
  // range like 8/1–8/15 could not pick 9/1 as the start at all, and "9/1 to 9/1"
  // was unreachable from the start field. Collapsing the range to the picked day
  // keeps it from ever inverting while leaving every date selectable, and a
  // single-day range (start == end) is a legitimate selection in its own right.
  const changeStartDate = (startDate: string) => {
    const endDate = startDate && customEndDate && startDate > customEndDate ? startDate : customEndDate;
    onCustomDateChange(startDate, endDate);
  };

  const changeEndDate = (endDate: string) => {
    const startDate = endDate && customStartDate && endDate < customStartDate ? endDate : customStartDate;
    onCustomDateChange(startDate, endDate);
  };

  return (

    /* RANGE FILTER */
    <div className="range-filter">

      {/* PRESET SEGMENTS */}
      <div className="range-pills" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`range-pill${range === option.value ? " is-active" : ""}`}
            aria-pressed={range === option.value}
            onClick={() => onRangeChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* CUSTOM DATE PICKERS — revealed only for the custom range. Neither input
          constrains the other's calendar; picking past the other end pulls it to
          the same day (see changeStartDate/changeEndDate) so the range collapses
          to that single day rather than the pick being refused. */}
      {range === "custom" && (
        <div className="range-custom">

          {/* START DATE */}
          <input
            type="date"
            className="input-field range-date"
            value={customStartDate}
            aria-label="Start date"
            onChange={(e) => changeStartDate(e.target.value)}
          />

          {/* SEPARATOR */}
          <span className="range-sep">to</span>

          {/* END DATE */}
          <input
            type="date"
            className="input-field range-date"
            value={customEndDate}
            aria-label="End date"
            onChange={(e) => changeEndDate(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
