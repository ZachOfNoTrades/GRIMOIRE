"use client"

import { ExerciseHistoryEntry } from "../../../types/exercise";
import { formatDateShortWithYear } from "../../../utils/format";

interface HistoryTabProps {
  history: ExerciseHistoryEntry[];
  loading: boolean;
}

export default function HistoryTab({ history, loading }: HistoryTabProps) {

  // LOADING PLACEHOLDER
  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <p className="text-secondary">Loading history...</p>
      </div>
    );
  }

  // EMPTY PLACEHOLDER
  if (history.length === 0) {
    return (
      <div className="flex justify-center items-center py-8">
        <p className="text-secondary">No history found for this exercise.</p>
      </div>
    );
  }

  return (

    // SESSION SUB-CARDS
    <div className="flex flex-col gap-3">
      {history.map((entry) => (

        // SESSION SUB-CARD
        <div key={entry.session_id} className="card">

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
                  {set.weight > 0 ? `${set.weight}` : "BW"} x {set.reps}
                  {set.rpe != null && <span className="text-secondary"> @{set.rpe}</span>}
                </p>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
