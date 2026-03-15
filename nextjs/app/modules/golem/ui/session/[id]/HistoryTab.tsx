"use client"

import { useEffect } from "react";
import { ExerciseHistoryEntry } from "../../../types/exercise";
import { HistoryRange, formatDateShortWithYear, formatDuration } from "../../../utils/format";

const rangeOptions: { value: HistoryRange; label: string }[] = [
  { value: "6m", label: "6 Months" },
  { value: "1y", label: "1 Year" },
  { value: "all", label: "All" },
  { value: "custom", label: "Date Range" },
];

interface HistoryTabProps {
  history: ExerciseHistoryEntry[];
  loading: boolean;
  range?: HistoryRange;
  customStartDate?: string;
  customEndDate?: string;
  onRangeChange?: (range: HistoryRange) => void;
  onCustomDateChange?: (startDate: string, endDate: string) => void;
  totalCount?: number;
  highlightSessionId?: string;
  onSessionClick?: (sessionId: string) => void;
}

export default function HistoryTab({ history, loading, range, customStartDate, customEndDate, onRangeChange, onCustomDateChange, totalCount, highlightSessionId, onSessionClick }: HistoryTabProps) {

  // Whether the current filter is hiding older results
  const hasOlderHistory = totalCount != null && totalCount > history.length;

  // Scroll to and highlight a specific session card when requested
  useEffect(() => {
    if (!highlightSessionId || loading) return;

    const timer = setTimeout(() => {
      const element = document.getElementById(`history-session-${highlightSessionId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("highlight-flash");
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [highlightSessionId, loading]);

  return (
    <div className="flex flex-col gap-3">

      {/* RANGE FILTER */}
      {onRangeChange && (
        <div className="flex flex-col gap-2 px-1">

          {/* RANGE DROPDOWN */}
          <select
            value={range}
            onChange={(e) => onRangeChange(e.target.value as HistoryRange)}
            className="input-field !w-auto"
          >
            {rangeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          {/* CUSTOM DATE PICKERS */}
          {range === "custom" && onCustomDateChange && (
            <div className="flex items-center gap-2">

              {/* START DATE */}
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => onCustomDateChange(e.target.value, customEndDate || "")}
                className="input-field flex-1"
              />

              {/* SEPARATOR */}
              <span className="text-secondary">to</span>

              {/* END DATE */}
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => onCustomDateChange(customStartDate || "", e.target.value)}
                className="input-field flex-1"
              />
            </div>
          )}
        </div>
      )}

      {/* LOADING PLACEHOLDER */}
      {loading ? (
        <div className="flex justify-center items-center py-8">
          <p className="text-secondary">Loading history...</p>
        </div>

        // EMPTY PLACEHOLDER
      ) : history.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-8">
          <p className="text-secondary">
            {hasOlderHistory
              ? `Showing 0 of ${totalCount} sessions.`
              : "No history found for this exercise."}
          </p>
        </div>

        // SESSION SUB-CARDS
      ) : (
        <>
        {/* SESSION COUNT */}
        {hasOlderHistory && (
          <p className="text-secondary text-sm px-1">Showing {history.length} of {totalCount} sessions.</p>
        )}

        {history.map((entry) => (

          // SESSION SUB-CARD
          <div
            key={entry.session_id}
            id={`history-session-${entry.session_id}`}
            className={`card ${onSessionClick ? "cursor-pointer" : ""}`}
            onClick={onSessionClick ? () => onSessionClick(entry.session_id) : undefined}
          >

            {/* SUB-CARD CONTENT */}
            <div className="card-content !gap-1">

              {/* SESSION NAME AND DATE */}
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-h2">{entry.session_name}</h3>

                {/* DATE */}
                <span className="text-secondary text-sm whitespace-nowrap">
                  {entry.started_at ? formatDateShortWithYear(entry.started_at) : "No date"}
                </span>
              </div>

              {/* PROGRAM NAME */}
              {entry.program_name && (
                <p className="text-secondary text-sm">{entry.program_name}</p>
              )}

              {/* SETS LIST */}
              <div className="flex flex-col gap-0.5 mt-1">
                {entry.sets.map((set, index) => (

                  // SET LINE
                  <p key={index} className={`text-sm ${set.is_warmup ? "text-secondary" : "text-primary"}`}>
                    {set.time_seconds != null && set.time_seconds > 0
                      ? <>
                          {set.weight > 0 ? `${set.weight} x ` : ""}
                          {formatDuration(set.time_seconds)}
                        </>
                      : <>
                          {set.weight > 0 ? `${set.weight}` : "BW"} x {set.reps}
                        </>
                    }
                    {set.rpe != null && <span className="text-secondary"> @{set.rpe}</span>}
                  </p>
                ))}
              </div>
            </div>
          </div>
        ))}
        </>
      )}
    </div>
  );
}
