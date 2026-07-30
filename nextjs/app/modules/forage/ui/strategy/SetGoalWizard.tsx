"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingDown, Minus, TrendingUp, Sparkles, ChevronLeft } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { GoalKind } from "../../types/goal";
import WeightRuler from "./WeightRuler";
import { lbInUnit, toLb, unitLabel } from "../../utils/units";
import { useWeightUnit } from "../../utils/useWeightUnit";

const GOALS: { kind: GoalKind; label: string; icon: typeof TrendingDown }[] = [
  { kind: "lose",     label: "Lose Weight",     icon: TrendingDown },
  { kind: "maintain", label: "Maintain Weight", icon: Minus },
  { kind: "gain",     label: "Gain Weight",     icon: TrendingUp },
];

const TOTAL_STEPS = 2;

// Slider bounds live in the user's display unit. The lbs preset (0.2, 2.5)
// maps to roughly (0.09, 1.13) kg/wk — close to standard kg/wk recommendations.
const SLIDER_BOUNDS = {
  lbs: { min: 0.2, max: 2.5, step: 0.05, decimals: 1 },
  kg:  { min: 0.1, max: 1.2, step: 0.02, decimals: 2 },
} as const;

// Evidence-based recommended ranges (% body weight per week)
//  Lose: 0.5%–1.0% (Harvard Health, NIH guidance)
//  Gain: 0.25%–0.5% (Precision Nutrition)
function recommendedRangePctBwPerWeek(kind: GoalKind): { low: number; high: number } | null {
  if (kind === "maintain") return null;
  if (kind === "lose") return { low: 0.5, high: 1.0 };
  return { low: 0.25, high: 0.5 };
}

function recommendedRangeRate(
  weightLb: number | null,
  kind: GoalKind | null,
  unit: "lbs" | "kg",
): { low: number; high: number } | null {
  if (!weightLb || !kind || kind === "maintain") return null;
  const range = recommendedRangePctBwPerWeek(kind)!;
  // Recommendation is % of body weight, computed in whatever unit weight is in.
  const wDisplay = lbInUnit(weightLb, unit);
  return {
    low: wDisplay * (range.low / 100),
    high: wDisplay * (range.high / 100),
  };
}

function pctOnSlider(rate: number, unit: "lbs" | "kg") {
  const b = SLIDER_BOUNDS[unit];
  const p = ((rate - b.min) / (b.max - b.min)) * 100;
  return Math.max(0, Math.min(100, p));
}

// Editable rate cell — local string state while focused, commits to parent on blur or Enter
function RateCell({
  value,
  onCommit,
  unit,
  decimals,
  sign,
}: {
  value: number;
  onCommit: (n: number) => void;
  unit: string;
  decimals: number;
  sign?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string>("");

  function commit() {
    const n = Number(draft);
    setFocused(false);
    if (Number.isFinite(n) && n > 0) onCommit(n);
  }

  return (
    /* RATE CELL */
    <label className="rate-cell">
      {sign && <span className="rate-cell-sign">{sign}</span>}
      <input
        type="text"
        inputMode="decimal"
        className="rate-cell-input"
        value={focused ? draft : value.toFixed(decimals)}
        onFocus={(e) => {
          setFocused(true);
          setDraft(value.toFixed(decimals));
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        }}
      />
      <span className="rate-cell-unit">{unit}</span>
    </label>
  );
}

export default function SetGoalWizard({
  isOpen,
  onClose,
  onComplete,
}: {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const weightUnit = useWeightUnit();
  const bounds = SLIDER_BOUNDS[weightUnit];
  const wkLabel = `${unitLabel(weightUnit)}/wk`;

  // INPUT — `targetDisplay` and `rateDisplay` live in the user's unit.
  const [step, setStep] = useState(0);
  const [goalKind, setGoalKind] = useState<GoalKind | null>(null);
  const [targetDisplay, setTargetDisplay] = useState<number | null>(null);
  const [rateDisplay, setRateDisplay] = useState<number>(weightUnit === "lbs" ? 1.0 : 0.5);

  // DATA
  const [latestWeightLb, setLatestWeightLb] = useState<number | null>(null);
  const [expenditureKcal, setExpenditureKcal] = useState<number | null>(null);
  const [floorKcal, setFloorKcal] = useState<number>(1500);

  // STATE
  const [isSaving, setIsSaving] = useState(false);
  const [touchedRate, setTouchedRate] = useState(false);
  const [touchedTarget, setTouchedTarget] = useState(false);

  // Load latest weight on mount
  useEffect(() => {
    fetch(`/modules/forage/api/weight`)
      .then((r) => r.json())
      .then((arr) => {
        if (Array.isArray(arr) && arr.length > 0) {
          const sorted = [...arr].sort((a, b) => (a.log_date < b.log_date ? 1 : -1));
          setLatestWeightLb(Number(sorted[0].weight_lb));
        }
      })
      .catch(() => {});
  }, []);

  // Load the estimated expenditure (maintenance) + calorie floor on mount, so
  // the initial-budget preview matches the authoritative server math — the same
  // adaptive expenditure (logged intake + weight trend) computeTargets uses,
  // rather than a rough bodyweight guess that ignored activity.
  useEffect(() => {
    fetch(`/modules/forage/api/expenditure`)
      .then((r) => r.json())
      .then((d) => {
        if (d && Number.isFinite(d.expenditure_kcal)) setExpenditureKcal(Number(d.expenditure_kcal));
        if (d && Number.isFinite(d.floor_kcal)) setFloorKcal(Number(d.floor_kcal));
      })
      .catch(() => {});
  }, []);

  // Seed defaults when arriving at step 1. Default rate sits at the midpoint
  // of the recommended range, which keeps the slider thumb inside the green band.
  useEffect(() => {
    if (step !== 1 || !goalKind || latestWeightLb == null) return;
    const curDisplay = Math.round(lbInUnit(latestWeightLb, weightUnit));
    if (!touchedTarget) {
      // Default ±10 (lbs) or ±5 (kg) drift from current.
      const drift = weightUnit === "lbs" ? 10 : 5;
      if (goalKind === "lose") setTargetDisplay(curDisplay - drift);
      else if (goalKind === "gain") setTargetDisplay(curDisplay + drift);
      else setTargetDisplay(curDisplay);
    }
    if (!touchedRate && goalKind !== "maintain") {
      const range = recommendedRangeRate(latestWeightLb, goalKind, weightUnit);
      if (range) {
        const mid = (range.low + range.high) / 2;
        const rounded = weightUnit === "lbs" ? Math.round(mid * 10) / 10 : Math.round(mid * 100) / 100;
        setRateDisplay(Math.max(bounds.min, Math.min(bounds.max, rounded)));
      }
    }
  }, [step, goalKind, latestWeightLb, touchedRate, touchedTarget, weightUnit, bounds.min, bounds.max]);

  function canAdvance(): boolean {
    if (step === 0) return goalKind !== null;
    if (step === 1) {
      if (goalKind === "maintain") return true;
      return targetDisplay != null && rateDisplay > 0;
    }
    return false;
  }

  async function handleSubmit() {
    if (!goalKind) return;
    setIsSaving(true);
    try {
      const ratePerWeekLb = goalKind === "maintain" ? null : toLb(rateDisplay, weightUnit);
      const targetLb = goalKind === "maintain" || targetDisplay == null ? null : toLb(targetDisplay, weightUnit);
      const res = await fetch(`/modules/forage/api/goal`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal_kind: goalKind,
          rate_lb_per_week: ratePerWeekLb == null ? null : Math.round(ratePerWeekLb * 100) / 100,
          target_weight_lb: targetLb == null ? null : Math.round(targetLb * 100) / 100,
        }),
      });
      if (res.ok) {
        // The API recomputes a coached program's macros against the new goal and
        // reports whether it did, so we can tell the user their targets moved.
        const saved = await res.json().catch(() => null);
        toast.success(saved?.targets_recomputed ? "Goal updated — macros recalculated" : "Goal set");
        onComplete();
      } else {
        toast.error("Failed");
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleNext() {
    if (!canAdvance()) return;
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
    else handleSubmit();
  }

  // STATE — derived figures (all in display unit)
  const currentWeightDisplay = latestWeightLb == null ? null : Math.round(lbInUnit(latestWeightLb, weightUnit));
  const rateMonth = rateDisplay * 4;
  // pct BW is unit-invariant since rate and weight share the same unit.
  const pctBwWeek = currentWeightDisplay && currentWeightDisplay > 0 ? (rateDisplay / currentWeightDisplay) * 100 : 0;
  const pctBwMonth = pctBwWeek * 4;

  // Initial daily budget (kcal): estimated expenditure ± delta from the goal rate
  // (7,700 kcal/kg fat tissue). dailyDelta is the per-day energy shift for the rate.
  const dailyDelta = useMemo(() => {
    if (goalKind === "maintain") return 0;
    // Convert rate to kg before applying energy density.
    const rateKg = toLb(rateDisplay, weightUnit) / 2.2046226218;
    return Math.round((rateKg * 7700) / 7);
  }, [goalKind, rateDisplay, weightUnit]);

  const dailyBudget = useMemo(() => {
    // Maintenance = the user's estimated expenditure (adaptive from logged intake
    // + weight trend server-side). Until it loads, fall back to the coarse
    // bodyweight formula so the pill isn't blank on first paint.
    const maintenance =
      expenditureKcal != null
        ? expenditureKcal
        : latestWeightLb != null
          ? Math.round((latestWeightLb / 2.2046226218) * 30)
          : null;
    if (maintenance == null) return null;
    // Clamp a deficit at the calorie floor, matching computeTargets server-side.
    if (goalKind === "lose") return Math.max(floorKcal, maintenance - dailyDelta);
    if (goalKind === "gain") return maintenance + dailyDelta;
    return maintenance;
  }, [expenditureKcal, floorKcal, latestWeightLb, goalKind, dailyDelta]);

  // Projected end date: weeks_needed = |target − current| / rate (in display unit; units cancel)
  const projectedEndDate = useMemo(() => {
    if (goalKind === "maintain" || currentWeightDisplay == null || targetDisplay == null || rateDisplay <= 0) return null;
    const diff = Math.abs(targetDisplay - currentWeightDisplay);
    if (diff < 0.1) return null;
    const weeks = diff / rateDisplay;
    const end = new Date();
    end.setDate(end.getDate() + Math.round(weeks * 7));
    return end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }, [goalKind, currentWeightDisplay, targetDisplay, rateDisplay]);

  // Recommended band overlay (slider track gradient)
  const recommendedRange = recommendedRangeRate(latestWeightLb, goalKind, weightUnit);
  const bandStartPct = recommendedRange ? pctOnSlider(recommendedRange.low, weightUnit) : 0;
  const bandEndPct = recommendedRange ? pctOnSlider(recommendedRange.high, weightUnit) : 100;
  const sliderStyle = recommendedRange
    ? ({ ["--band-start" as string]: `${bandStartPct}%`, ["--band-end" as string]: `${bandEndPct}%` } as React.CSSProperties)
    : undefined;

  const isRecommended =
    recommendedRange != null &&
    rateDisplay >= recommendedRange.low &&
    rateDisplay <= recommendedRange.high;

  // Apply a new rate from any of the editable cells (in display unit)
  function commitRate(next: number) {
    const clamped = Math.max(bounds.min, Math.min(bounds.max, next));
    const rounded = weightUnit === "lbs"
      ? Math.round(clamped * 100) / 100
      : Math.round(clamped * 1000) / 1000;
    setRateDisplay(rounded);
    setTouchedRate(true);
  }

  // Title with optional inline back button on the left (close X stays top-right via Modal default)
  const titleNode = step > 0 ? (
    /* TITLE WITH BACK */
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
      <Button
        className="btn-link"
        aria-label="Back"
        disabled={isSaving}
        onClick={() => setStep(step - 1)}
        style={{ padding: "0 0.25rem", marginLeft: "-0.25rem" }}
      >
        <ChevronLeft className="w-5 h-5" />
      </Button>
      Set New Goal
    </span>
  ) : "Set New Goal";

  const sign = goalKind === "lose" ? "−" : "+";

  // Ruler bounds in display unit (60..500 lb ≈ 27..227 kg).
  const rulerAbsoluteMin = weightUnit === "lbs" ? 60 : 27;
  const rulerAbsoluteMax = weightUnit === "lbs" ? 500 : 227;
  const rulerWindow = weightUnit === "lbs" ? 80 : 36;

  return (
    /* SET GOAL WIZARD MODAL */
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={titleNode}
      disableClose={isSaving}
      fullHeight
      subHeader={
        /* PROGRESS */
        <div className="wizard-progress" aria-label={`Step ${step + 1} of ${TOTAL_STEPS}`}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span key={i} data-filled={i <= step ? "true" : "false"} />
          ))}
        </div>
      }
      footer={
        <Button className="btn-blue" onClick={handleNext} disabled={!canAdvance() || isSaving} style={{ width: "100%" }}>
          {isSaving ? "Saving..." : step === TOTAL_STEPS - 1 ? "Done" : "Next"}
        </Button>
      }
    >
      {/* STEP 0 — GOAL KIND */}
      {step === 0 && (
        <div>
          <h2 className="text-card-title" style={{ marginBottom: "1rem" }}>What is your goal?</h2>

          {/* OPTIONS */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {GOALS.map((g) => {
              const Icon = g.icon;
              const active = goalKind === g.kind;
              return (
                <button
                  key={g.kind}
                  type="button"
                  className="option-card"
                  aria-pressed={active}
                  onClick={() => {
                    setGoalKind(g.kind);
                    setTouchedRate(false);
                    setTouchedTarget(false);
                  }}
                >
                  <Icon className="option-card-icon w-6 h-6" />
                  <div className="option-card-body">
                    <div className="option-card-title">{g.label}</div>
                  </div>
                  <span className="option-card-radio" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 1 — TARGET WEIGHT + RATE */}
      {step === 1 && goalKind && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* PREVIEW PILL ROW */}
          {goalKind !== "maintain" && (dailyBudget != null || projectedEndDate != null) && (
            <div className="preview-pill-row">
              {/* INITIAL DAILY BUDGET */}
              <div className="preview-pill" data-kind="kcal">
                <div className="preview-pill-value">{dailyBudget != null ? `${dailyBudget} kcal` : "—"}</div>
                <div className="preview-pill-label">initial daily budget</div>
              </div>

              {/* PROJECTED END DATE */}
              <div className="preview-pill" data-kind="date">
                <div className="preview-pill-value">{projectedEndDate ?? "—"}</div>
                <div className="preview-pill-label">projected end date</div>
              </div>
            </div>
          )}

          {/* TARGET WEIGHT */}
          {goalKind !== "maintain" && (
            <div>
              <h2 className="text-card-title" style={{ marginBottom: "0.75rem" }}>What is your target weight?</h2>
              {targetDisplay != null && currentWeightDisplay != null && (
                <WeightRuler
                  value={targetDisplay}
                  onChange={(v) => { setTargetDisplay(v); setTouchedTarget(true); }}
                  min={Math.max(rulerAbsoluteMin, currentWeightDisplay - rulerWindow)}
                  max={Math.min(rulerAbsoluteMax, currentWeightDisplay + rulerWindow)}
                  absoluteMin={rulerAbsoluteMin}
                  absoluteMax={rulerAbsoluteMax}
                  unit={unitLabel(weightUnit)}
                />
              )}
            </div>
          )}

          {/* RATE SECTION */}
          {goalKind !== "maintain" && (
            <div>
              <h2 className="text-card-title" style={{ marginBottom: "0.75rem" }}>What is your target goal rate?</h2>

              {/* RECOMMENDED BADGE */}
              {isRecommended && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.625rem" }}>
                  <span className="recommended-badge">
                    <Sparkles className="w-3.5 h-3.5" /> Standard (Recommended)
                  </span>
                </div>
              )}

              {/* RATE SLIDER WITH BAND */}
              <input
                type="range"
                className="rate-slider"
                min={bounds.min}
                max={bounds.max}
                step={bounds.step}
                value={rateDisplay}
                onChange={(e) => commitRate(Number(e.target.value))}
                style={sliderStyle}
                aria-label={`Goal rate, ${unitLabel(weightUnit)} per week`}
              />

              {/* SLIDER LEGEND */}
              {recommendedRange && (
                <div className="rate-legend" aria-hidden="true">
                  <span data-edge="left">{bounds.min.toFixed(bounds.decimals)}</span>
                  <span data-recommended="true" style={{ left: `${bandStartPct}%` }}>
                    {recommendedRange.low.toFixed(bounds.decimals)}
                  </span>
                  <span data-recommended="true" style={{ left: `${bandEndPct}%` }}>
                    {recommendedRange.high.toFixed(bounds.decimals)}
                  </span>
                  <span data-edge="right" style={{ left: "100%" }}>{bounds.max.toFixed(bounds.decimals)} {wkLabel}</span>
                </div>
              )}

              {/* RATE GROUPS — stacked per-period, each row has 2 cells side-by-side */}
              <div className="rate-groups" style={{ marginTop: "1.25rem" }}>
                {/* PER WEEK */}
                <div className="rate-group">
                  <div className="rate-group-label">Per Week</div>
                  <div className="rate-group-cells">
                    <RateCell
                      value={rateDisplay}
                      onCommit={(n) => commitRate(n)}
                      unit={unitLabel(weightUnit)}
                      decimals={bounds.decimals}
                      sign={sign}
                    />
                    <RateCell
                      value={pctBwWeek}
                      onCommit={(pct) => {
                        if (!currentWeightDisplay) return;
                        commitRate(currentWeightDisplay * (pct / 100));
                      }}
                      unit="% BW"
                      decimals={2}
                      sign={sign}
                    />
                  </div>
                </div>

                {/* PER MONTH */}
                <div className="rate-group">
                  <div className="rate-group-label">Per Month</div>
                  <div className="rate-group-cells">
                    <RateCell
                      value={rateMonth}
                      onCommit={(monthly) => commitRate(monthly / 4)}
                      unit={unitLabel(weightUnit)}
                      decimals={bounds.decimals}
                      sign={sign}
                    />
                    <RateCell
                      value={pctBwMonth}
                      onCommit={(pctMonth) => {
                        if (!currentWeightDisplay) return;
                        commitRate(currentWeightDisplay * ((pctMonth / 4) / 100));
                      }}
                      unit="% BW"
                      decimals={1}
                      sign={sign}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MAINTAIN COPY */}
          {goalKind === "maintain" && (
            <div className="sub-card" style={{ padding: "1rem" }}>
              <div className="text-card-title" style={{ marginBottom: "0.5rem" }}>Maintenance plan</div>
              <div className="text-subtle" style={{ lineHeight: 1.5 }}>
                Your targets will hold steady at your estimated maintenance. We'll re-balance them on each
                check-in if your weight drifts. Continue to the program step to fill out your preferences.
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
