"use client"

import { ExerciseHistoryEntry } from "../../../types/exercise";
import { calculateEstimatedOneRepMax } from "../../../utils/calc";

interface StatsTabProps {
  history: ExerciseHistoryEntry[];
  loading: boolean;
}

export default function StatsTab({ history, loading }: StatsTabProps) {

  // LOADING PLACEHOLDER
  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <p className="text-secondary">Loading stats...</p>
      </div>
    );
  }

  // Compute stats from history
  const workingSets = history.flatMap((entry) =>
    entry.sets.filter((set) => !set.is_warmup && set.weight > 0 && set.reps > 0)
  );

  // EMPTY PLACEHOLDER
  if (workingSets.length === 0) {
    return (
      <div className="flex justify-center items-center py-8">
        <p className="text-secondary">No stats available.</p>
      </div>
    );
  }

  // Estimated 1RM from best working set by Epley
  const bestOneRepMax = Math.max(
    ...workingSets.map((set) => calculateEstimatedOneRepMax(set.weight, set.reps))
  );

  // Best volume set (highest weight x reps)
  const bestVolumeSet = workingSets.reduce((best, set) =>
    set.weight * set.reps > best.weight * best.reps ? set : best
  );

  // Best weight set (heaviest weight lifted)
  const bestWeightSet = workingSets.reduce((best, set) =>
    set.weight > best.weight ? set : best
  );

  return (
    <div className="stat-section">

      {/* ESTIMATED 1RM */}
      <div className="stat-card">
        <p className="stat-label">e1RM</p>
        <p className="stat-value">{bestOneRepMax} lbs</p>
      </div>

      {/* BEST VOLUME SET */}
      <div className="stat-card">
        <p className="stat-label">Best Volume Set</p>
        <p className="stat-value">{bestVolumeSet.weight} x {bestVolumeSet.reps}</p>
      </div>

      {/* BEST WEIGHT SET */}
      <div className="stat-card">
        <p className="stat-label">Best Weight Set</p>
        <p className="stat-value">{bestWeightSet.weight} x {bestWeightSet.reps}</p>
      </div>
    </div>
  );
}
