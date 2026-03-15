import { ExerciseHistoryEntry } from "../../../types/exercise";
import { calculateEstimatedOneRepMax } from "../../../utils/calc";
import { HistoryRange } from "../../../utils/format";
import ProgressionChart, { ChartDataPoint } from "../../../components/ProgressionChart";

const rangeOptions: { value: HistoryRange; label: string }[] = [
  { value: "6m", label: "6 Months" },
  { value: "1y", label: "1 Year" },
  { value: "all", label: "All" },
  { value: "custom", label: "Date Range" },
];

interface StatsTabProps {
  history: ExerciseHistoryEntry[];
  loading: boolean;
  range: HistoryRange;
  customStartDate: string;
  customEndDate: string;
  onRangeChange: (range: HistoryRange) => void;
  onCustomDateChange: (startDate: string, endDate: string) => void;
  onNavigateToSession?: (sessionId: string) => void;
}

// ─── Chart Grouping ─────────────────────────────────────────

type GroupingStrategy = "week" | "month" | "year";

// Determines grouping strategy: 6m → week, 1y → month, all/custom → based on data span
function getGroupingStrategy(range: HistoryRange, dataPoints: ChartDataPoint[]): GroupingStrategy {
  if (range === "6m") return "week";
  if (range === "1y") return "month";
  if (dataPoints.length < 2) return "week";
  const spanMs = dataPoints[dataPoints.length - 1].date.getTime() - dataPoints[0].date.getTime();
  const spanYears = spanMs / (365.25 * 24 * 60 * 60 * 1000);
  if (spanYears < 1) return "week";
  if (spanYears < 3) return "month";
  return "year";
}

// Returns a bucket key string for the given date and strategy
function getBucketKey(date: Date, strategy: GroupingStrategy): string {
  if (strategy === "year") return `${date.getFullYear()}`;
  if (strategy === "month") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  // Week: use Monday of that ISO week
  const monday = new Date(date);
  const dayOfWeek = monday.getDay();
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  monday.setDate(monday.getDate() + offsetToMonday);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

// Parses a bucket key back into a representative Date
function getBucketDate(bucketKey: string, strategy: GroupingStrategy): Date {
  if (strategy === "year") return new Date(parseInt(bucketKey), 0, 1);
  const parts = bucketKey.split("-").map(Number);
  if (strategy === "month") return new Date(parts[0], parts[1] - 1, 1);
  return new Date(parts[0], parts[1] - 1, parts[2]); // week: Monday date
}

// Formats a bucket date into a readable axis label
function getBucketLabel(date: Date, strategy: GroupingStrategy): string {
  if (strategy === "year") return `${date.getFullYear()}`;
  if (strategy === "month") return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }); // week
}

// Groups raw per-session data points into time buckets, taking the best e1RM per bucket
function groupDataPoints(dataPoints: ChartDataPoint[], strategy: GroupingStrategy): ChartDataPoint[] {
  const buckets = new Map<string, ChartDataPoint[]>();
  for (const point of dataPoints) {
    const key = getBucketKey(point.date, strategy);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(point);
  }
  return Array.from(buckets.entries())
    .map(([key, points]) => {
      const bucketDate = getBucketDate(key, strategy);
      return {
        date: bucketDate,
        dateLabel: getBucketLabel(bucketDate, strategy),
        estimatedOneRepMax: Math.max(...points.map((point) => point.estimatedOneRepMax)),
      };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export default function StatsTab({
  history,
  loading,
  range,
  customStartDate,
  customEndDate,
  onRangeChange,
  onCustomDateChange,
  onNavigateToSession,
}: StatsTabProps) {

  // Build per-session chart data points in chronological order
  const dataPoints: ChartDataPoint[] = history
    .filter((entry) => entry.started_at)
    .map((entry) => {
      const workingSets = entry.sets.filter((set) => !set.is_warmup && set.weight > 0 && set.reps != null && set.reps > 0);
      if (workingSets.length === 0) return null;
      const date = new Date(entry.started_at!);
      return {
        date,
        dateLabel: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        estimatedOneRepMax: Math.max(...workingSets.map((set) => calculateEstimatedOneRepMax(set.weight, set.reps!))),
      } as ChartDataPoint;
    })
    .filter(Boolean)
    .sort((a, b) => a!.date.getTime() - b!.date.getTime()) as ChartDataPoint[];

  // Group data points by time bucket based on selected range
  const groupingStrategy = getGroupingStrategy(range, dataPoints);
  const groupedDataPoints = groupDataPoints(dataPoints, groupingStrategy);

  // Aggregate all working sets across sessions for stat cards (with session_id for navigation)
  const allWorkingSets = history.flatMap((entry) =>
    entry.sets
      .filter((set) => !set.is_warmup && set.weight > 0 && set.reps != null && set.reps > 0)
      .map((set) => ({ ...set, session_id: entry.session_id }))
  );

  const bestOneRepMaxSet = allWorkingSets.length > 0
    ? allWorkingSets.reduce((best, set) =>
        calculateEstimatedOneRepMax(set.weight, set.reps!) > calculateEstimatedOneRepMax(best.weight, best.reps!) ? set : best)
    : null;

  const bestEstimatedOneRepMax = bestOneRepMaxSet
    ? calculateEstimatedOneRepMax(bestOneRepMaxSet.weight, bestOneRepMaxSet.reps!)
    : null;

  const bestVolumeSet = allWorkingSets.length > 0
    ? allWorkingSets.reduce((best, set) => (set.weight * (set.reps ?? 0) > best.weight * (best.reps ?? 0) ? set : best))
    : null;

  const bestWeightSet = allWorkingSets.length > 0
    ? allWorkingSets.reduce((best, set) => (set.weight > best.weight ? set : best))
    : null;

  // Trend: compare first grouped point to most recent grouped point
  const trendPercent = groupedDataPoints.length >= 2
    ? (() => {
        const firstValue = groupedDataPoints[0].estimatedOneRepMax;
        const lastValue = groupedDataPoints[groupedDataPoints.length - 1].estimatedOneRepMax;
        return firstValue > 0 ? Math.round(((lastValue - firstValue) / firstValue) * 100) : null;
      })()
    : null;

  return (
    <div className="flex flex-col gap-3">

      {/* RANGE FILTER */}
      <div className="flex flex-col gap-2 px-1">

        {/* RANGE DROPDOWN */}
        <select
          value={range}
          onChange={(event) => onRangeChange(event.target.value as HistoryRange)}
          className="input-field !w-auto"
        >
          {rangeOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        {/* CUSTOM DATE PICKERS */}
        {range === "custom" && (
          <div className="flex items-center gap-2">

            {/* START DATE */}
            <input
              type="date"
              value={customStartDate}
              onChange={(event) => onCustomDateChange(event.target.value, customEndDate)}
              className="input-field flex-1"
            />

            {/* SEPARATOR */}
            <span className="text-secondary">to</span>

            {/* END DATE */}
            <input
              type="date"
              value={customEndDate}
              onChange={(event) => onCustomDateChange(customStartDate, event.target.value)}
              className="input-field flex-1"
            />
          </div>
        )}
      </div>

      {/* LOADING PLACEHOLDER */}
      {loading ? (
        <div className="flex justify-center items-center py-8">
          <p className="text-secondary">Loading stats...</p>
        </div>

        // EMPTY PLACEHOLDER
      ) : allWorkingSets.length === 0 ? (
        <div className="flex justify-center items-center py-8">
          <p className="text-secondary">No stats available.</p>
        </div>
      ) : (
        <>

          {/* STAT CARDS */}
          <div className="stat-section">

            {/* ESTIMATED 1RM */}
            <div
              className={`stat-card ${onNavigateToSession ? "cursor-pointer" : ""}`}
              onClick={() => onNavigateToSession?.(bestOneRepMaxSet!.session_id)}
            >
              <p className="stat-label">e1RM</p>

              {/* VALUE + TREND */}
              <div className="flex items-baseline gap-2">
                <p className="stat-value">{bestEstimatedOneRepMax} lbs</p>

                {/* TREND INDICATOR */}
                {trendPercent !== null && trendPercent !== 0 && (
                  <span
                    className="text-xs font-medium"
                    style={{ color: trendPercent > 0 ? "var(--alert-green-text)" : "var(--alert-red-text)" }}
                  >
                    {trendPercent > 0 ? "+" : ""}{trendPercent}%
                  </span>
                )}
              </div>
            </div>

            {/* BEST VOLUME SET */}
            <div
              className={`stat-card ${onNavigateToSession ? "cursor-pointer" : ""}`}
              onClick={() => onNavigateToSession?.(bestVolumeSet!.session_id)}
            >
              <p className="stat-label">Best Volume</p>
              <p className="stat-value">{bestVolumeSet!.weight} x {bestVolumeSet!.reps}</p>
            </div>

            {/* BEST WEIGHT SET */}
            <div
              className={`stat-card ${onNavigateToSession ? "cursor-pointer" : ""}`}
              onClick={() => onNavigateToSession?.(bestWeightSet!.session_id)}
            >
              <p className="stat-label">Best Weight</p>
              <p className="stat-value">{bestWeightSet!.weight} x {bestWeightSet!.reps}</p>
            </div>
          </div>

          {/* E1RM PROGRESSION CHART */}
          <ProgressionChart dataPoints={groupedDataPoints} />

          {/* INSUFFICIENT DATA NOTE */}
          {groupedDataPoints.length === 1 && (
            <p className="text-secondary text-sm text-center">Chart requires 2+ time periods to display.</p>
          )}
        </>
      )}
    </div>
  );
}
