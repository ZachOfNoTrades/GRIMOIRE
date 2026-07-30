"use client";

import { NutritionRange, NUTRITION_RANGE_OPTIONS } from "../../utils/dateRange";
import "./nutritionRange.css";

interface NutritionRangeSelectorProps {
  range: NutritionRange;
  customStartDate: string;
  customEndDate: string;
  onRangeChange: (range: NutritionRange) => void;
  onCustomDateChange: (startDate: string, endDate: string) => void;
}

/* ─── NUTRITION RANGE SELECTOR ───
   Date-range picker shared by the nutrition overview + per-nutrient detail
   pages. A full-width segmented control (Today / 1W / 1M / 3M / 1Y / Custom) —
   every preset visible and one tap to switch — with a pair of date inputs
   revealed below when the "Custom" segment is active. All color comes from the
   grimoire theme tokens. */
export default function NutritionRangeSelector({
  range,
  customStartDate,
  customEndDate,
  onRangeChange,
  onCustomDateChange,
}: NutritionRangeSelectorProps) {
  return (
    /* RANGE FILTER */
    <div className="nutr-range">

      {/* PRESET SEGMENTS */}
      <div className="nutr-range-pills" role="group" aria-label="Date range">
        {NUTRITION_RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`nutr-range-pill${range === option.value ? " is-active" : ""}`}
            aria-pressed={range === option.value}
            onClick={() => onRangeChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* CUSTOM DATE PICKERS — revealed only for the custom range */}
      {range === "custom" && (
        <div className="nutr-range-custom">

          {/* START DATE */}
          <input
            type="date"
            className="input-field nutr-range-date"
            value={customStartDate}
            aria-label="Start date"
            max={customEndDate || undefined}
            onChange={(e) => onCustomDateChange(e.target.value, customEndDate)}
          />

          {/* SEPARATOR */}
          <span className="nutr-range-sep">to</span>

          {/* END DATE */}
          <input
            type="date"
            className="input-field nutr-range-date"
            value={customEndDate}
            aria-label="End date"
            min={customStartDate || undefined}
            onChange={(e) => onCustomDateChange(customStartDate, e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
