"use client";

import { useEffect, useState } from "react";
import {
  Bean, Egg, Beef, Drumstick,
  Scale, Fish, Cookie, EggFried,
  Coffee, Dumbbell, Footprints, CheckCheck,
  AlignJustify, Waves,
  Star, TriangleAlert,
  Sparkles, SlidersHorizontal,
  ChevronLeft,
} from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { selectOnFocus, focusOnEnter, blurOnEnter } from "@/lib/inputBehavior";
import MacroRibbon from "./MacroRibbon";
import {
  DietKind, DistributionKind, FloorKind, Program, ProgramStyle, ProteinBand, TrainingKind,
} from "../../types/program";
import { MacroTarget } from "../../types/target";
import { Nutrient } from "../../types/food";
import { lbInUnit, unitLabel } from "../../utils/units";
import { useWeightUnit } from "../../utils/useWeightUnit";
import ProgramNutrientGoals, { GoalRow, goalRowError } from "./ProgramNutrientGoals";

const STYLE: { kind: ProgramStyle; label: string; desc: string; icon: typeof Sparkles }[] = [
  { kind: "coached", label: "Coached",  desc: "We compute your daily targets from your weigh-ins and re-balance each week.", icon: Sparkles },
  { kind: "manual",  label: "Manual",   desc: "You set your own macro targets for the week. No check-ins.",                  icon: SlidersHorizontal },
];

const PROTEIN: { kind: ProteinBand; label: string; desc: string; icon: typeof Bean }[] = [
  { kind: "low",        label: "Low",        desc: "On the low side of the optimal range.",  icon: Bean },
  { kind: "moderate",   label: "Moderate",   desc: "In the middle of the optimal range.",    icon: Egg },
  { kind: "high",       label: "High",       desc: "On the high end of the optimal range.",  icon: Beef },
  { kind: "extra_high", label: "Extra High", desc: "Highest recommended intake.",            icon: Drumstick },
];

const DIET: { kind: DietKind; label: string; desc: string; icon: typeof Scale }[] = [
  { kind: "balanced", label: "Balanced", desc: "Standard distribution of carbs and fat",                icon: Scale },
  { kind: "low_fat",  label: "Low-fat",  desc: "Fat will be reduced to prioritize carb and protein.",    icon: Fish },
  { kind: "low_carb", label: "Low-carb", desc: "Carbs will be reduced to prioritize fat and protein.",   icon: Cookie },
  { kind: "keto",     label: "Keto",     desc: "Carbs will be very restricted to allow higher fat.",     icon: EggFried },
];

const TRAINING: { kind: TrainingKind; label: string; icon: typeof Coffee }[] = [
  { kind: "none",            label: "None or Relaxed Activity", icon: Coffee },
  { kind: "lifting",         label: "Lifting",                  icon: Dumbbell },
  { kind: "cardio",          label: "Cardio",                   icon: Footprints },
  { kind: "cardio_lifting",  label: "Cardio & Lifting",         icon: CheckCheck },
];

const DISTRIBUTION: { kind: DistributionKind; label: string; desc: string; icon: typeof AlignJustify }[] = [
  { kind: "even",    label: "Distribute Evenly", desc: "Same Calories every day of the week.",          icon: AlignJustify },
  { kind: "shifted", label: "Shift Calories",    desc: "Raise Calories on specific days, lower others.",icon: Waves },
];

const FLOOR: { kind: FloorKind; label: string; desc: string; icon: typeof Star }[] = [
  { kind: "standard", label: "Standard Floor", desc: "Recommendations will never go below 1500 kcal.",                icon: Star },
  { kind: "low",      label: "Low Floor",      desc: "Recommendations will never go below 1050 kcal (use caution).",  icon: TriangleAlert },
];

const WEEKDAYS = [
  { num: 1, label: "Mon" },
  { num: 2, label: "Tue" },
  { num: 3, label: "Wed" },
  { num: 4, label: "Thu" },
  { num: 5, label: "Fri" },
  { num: 6, label: "Sat" },
  { num: 7, label: "Sun" },
];

// Step 0 is the style chooser for both trees. Coached then runs 5 prefs +
// check-in day + preview + custom nutrient goals (9 total); manual runs a macros
// step + custom nutrient goals (3 total). The nutrient-goals step is always last.
const COACHED_STEPS = 9;
const MANUAL_STEPS = 3;

const PROTEIN_LABEL: Record<ProteinBand, string> = {
  low: "Low", moderate: "Moderate", high: "High", extra_high: "Extra-high",
};
const DIET_LABEL: Record<DietKind, string> = {
  balanced: "Balanced", low_fat: "Low-fat", low_carb: "Low-carb", keto: "Keto",
};
const GOAL_VERB_PAST: Record<string, string> = {
  lose: "losing", maintain: "maintaining", gain: "gaining",
};

interface PreviewResult {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  latest_weight_lb: number | null;
  maintenance_kcal: number | null;
  goal_kind: "lose" | "maintain" | "gain";
  rate_lb_per_week: number | null;
}

export default function SetProgramWizard({
  isOpen,
  onClose,
  onComplete,
  existingProgram = null,
  existingTarget = null,
}: {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  // When editing, the active program + its current macro target. Both null when
  // creating a new program — the wizard then starts blank.
  existingProgram?: Program | null;
  existingTarget?: MacroTarget | null;
}) {
  const weightUnit = useWeightUnit();
  const wkLabel = `${unitLabel(weightUnit)}/wk`;

  // Editing an existing program prefills every choice so the user tweaks rather
  // than re-enters. Manual macros prefill only from a manual program's target.
  const isEditing = existingProgram !== null;
  const editingManual = existingProgram?.program_style === "manual";
  const macroStr = (n: number | undefined) => (n != null ? String(n) : "");

  // INPUT
  const [step, setStep] = useState(0);
  const [programStyle, setProgramStyle] = useState<ProgramStyle | null>(existingProgram?.program_style ?? null);
  const [proteinBand, setProteinBand] = useState<ProteinBand | null>(existingProgram?.protein_band ?? null);
  const [dietKind, setDietKind] = useState<DietKind | null>(existingProgram?.diet_kind ?? null);
  const [trainingKind, setTrainingKind] = useState<TrainingKind | null>(existingProgram?.training_kind ?? null);
  const [distributionKind, setDistributionKind] = useState<DistributionKind | null>(existingProgram?.distribution_kind ?? null);
  const [highDays, setHighDays] = useState<number[]>(existingProgram?.shifted_high_days ?? []);
  const [floorKind, setFloorKind] = useState<FloorKind | null>(existingProgram?.floor_kind ?? null);
  const [checkInDay, setCheckInDay] = useState<number>(existingProgram?.check_in_weekday ?? 5); // Fri default
  // Manual targets — kept as strings while typing. User enters all four values.
  const [manualCalories, setManualCalories] = useState(editingManual ? macroStr(existingTarget?.kcal) : "");
  const [manualProtein, setManualProtein] = useState(editingManual ? macroStr(existingTarget?.protein_g) : "");
  const [manualCarbs, setManualCarbs] = useState(editingManual ? macroStr(existingTarget?.carbs_g) : "");
  const [manualFat, setManualFat] = useState(editingManual ? macroStr(existingTarget?.fat_g) : "");
  // Custom per-nutrient goal rows for the final step (seeded from the active
  // program's existing overrides in the effect below).
  const [goalRows, setGoalRows] = useState<GoalRow[]>([]);

  // DATA
  const [nutrients, setNutrients] = useState<Nutrient[]>([]);
  // Nutrient ids that already had an override on the active program (carried
  // forward to the new program on submit). Used to DELETE the ones the user
  // removed so the new program ends with exactly the edited set.
  const [originalOverrideIds, setOriginalOverrideIds] = useState<Set<string>>(new Set());

  // STATE
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isLoadingNutrients, setIsLoadingNutrients] = useState(true);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const isManual = programStyle === "manual";
  const isCoached = programStyle === "coached";
  const totalSteps = isManual ? MANUAL_STEPS : COACHED_STEPS;
  // The custom-nutrient-goals step index — always the last step of each tree.
  const goalsStep = isManual ? 2 : 8;

  // Load the nutrient reference list + the active program's RAW overrides, then
  // seed the editor rows (NULL markers → blank so the FDA placeholder shows).
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/modules/forage/api/nutrients").then((r) => r.json()),
      fetch("/modules/forage/api/nutrient-targets?raw=1").then((r) => r.json()),
    ])
      .then(([nData, oData]) => {
        if (!alive) return;
        const nutrientList: Nutrient[] = Array.isArray(nData) ? nData : [];
        const overrides: any[] = Array.isArray(oData) ? oData : [];
        setNutrients(nutrientList);
        // One row per nutrient (all shown on the step). Seed each from its raw
        // override if present (NULL marker → blank, so the FDA placeholder shows);
        // everything else starts blank.
        const num = (v: number | null | undefined) => (v != null ? String(v) : "");
        const overrideMap = new Map(overrides.map((o) => [o.nutrient_id, o]));
        setGoalRows(nutrientList.map((n) => {
          const o = overrideMap.get(n.id);
          return { nutrientId: n.id, floor: num(o?.floor), target: num(o?.target), ceiling: num(o?.ceiling) };
        }));
        setOriginalOverrideIds(new Set(overrideMap.keys()));
      })
      .catch((e) => console.error(e))
      .finally(() => { if (alive) setIsLoadingNutrients(false); });
    return () => { alive = false; };
  }, []);

  // Manual macros (NaN-safe). All four are user-entered, nothing is derived.
  const manualCal = Math.max(0, parseFloat(manualCalories) || 0);
  const manualP = Math.max(0, parseFloat(manualProtein) || 0);
  const manualC = Math.max(0, parseFloat(manualCarbs) || 0);
  const manualF = Math.max(0, parseFloat(manualFat) || 0);

  function canAdvance(): boolean {
    if (step === 0) return programStyle !== null;
    // The custom nutrient-goals step is optional, but block submit while any row
    // has an out-of-order or invalid band (the step shows which inline).
    if (step === goalsStep) return !isLoadingNutrients && validateGoals() === null;
    if (isManual) {
      // STEP 1 — targets: need a calorie target.
      return manualCal > 0;
    }
    // COACHED — steps 1..7
    switch (step) {
      case 1: return proteinBand !== null;
      case 2: return dietKind !== null;
      case 3: return trainingKind !== null;
      case 4:
        if (distributionKind === null) return false;
        if (distributionKind === "shifted") return highDays.length >= 1 && highDays.length <= 6;
        return true;
      case 5: return floorKind !== null;
      case 6: return checkInDay >= 1 && checkInDay <= 7;
      case 7: return preview !== null && !isLoadingPreview;
      default: return false;
    }
  }

  function payload() {
    if (isManual) {
      return {
        program_style: "manual" as const,
        kcal: manualCal,
        protein_g: manualP,
        carbs_g: manualC,
        fat_g: manualF,
      };
    }
    return {
      program_style: "coached" as const,
      protein_band: proteinBand,
      diet_kind: dietKind,
      training_kind: trainingKind,
      distribution_kind: distributionKind,
      shifted_high_days: distributionKind === "shifted" ? highDays : null,
      floor_kind: floorKind,
      check_in_weekday: checkInDay,
    };
  }

  async function fetchPreview() {
    setIsLoadingPreview(true);
    setPreview(null);
    try {
      const res = await fetch(`/modules/forage/api/program/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      if (res.ok) {
        setPreview(await res.json());
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error ?? "Preview failed");
      }
    } finally {
      setIsLoadingPreview(false);
    }
  }

  // Convert a goal row's typed strings to a RAW band (blank → null, so the FDA
  // placeholder is NOT persisted). Returns null when nothing was typed.
  function rawBand(r: GoalRow): { floor: number | null; target: number | null; ceiling: number | null } | null {
    const mark = (s: string) => { const t = s.trim(); return t === "" ? null : Number(t); };
    const band = { floor: mark(r.floor), target: mark(r.target), ceiling: mark(r.ceiling) };
    if (band.floor == null && band.target == null && band.ceiling == null) return null;
    return band;
  }

  // Validate every goal row via the shared per-row checker (effective band must
  // read floor ≤ target ≤ ceiling, values non-negative). Returns the first error
  // message, or null when all rows are valid. Same helper the step uses to draw
  // the inline highlight, so disable-on-invalid and the red fields never disagree.
  function validateGoals(): string | null {
    const byId = new Map(nutrients.map((n) => [n.id, n]));
    for (const r of goalRows) {
      const n = byId.get(r.nutrientId);
      if (!n) continue;
      const err = goalRowError(n, r);
      if (err) return `${n.name}: ${err.message}`;
    }
    return null;
  }

  // Apply the edited nutrient goals to the freshly-created active program: PUT each
  // row that has a typed marker; DELETE any override the user removed (originals
  // were carried forward onto the new program). Returns false if any call failed.
  async function applyGoals(): Promise<boolean> {
    const desiredIds = new Set<string>();
    const ops: Promise<Response>[] = [];
    for (const r of goalRows) {
      const band = rawBand(r);
      if (!band) continue;
      desiredIds.add(r.nutrientId);
      ops.push(fetch(`/modules/forage/api/nutrient-targets/${r.nutrientId}`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(band),
      }));
    }
    for (const id of originalOverrideIds) {
      if (!desiredIds.has(id)) {
        ops.push(fetch(`/modules/forage/api/nutrient-targets/${id}`, { method: "DELETE" }));
      }
    }
    const results = await Promise.all(ops);
    return results.every((res) => res.ok);
  }

  async function handleSubmit() {
    const goalError = validateGoals();
    if (goalError) { toast.error(goalError); return; }
    setIsSubmitting(true);
    try {
      const res = await fetch(`/modules/forage/api/program`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body?.error ?? "Failed");
        return;
      }
      // Program exists + is active now — layer the custom nutrient goals on top.
      const goalsOk = await applyGoals();
      if (goalsOk) toast.success("Program activated");
      else toast.error("Program saved, but some nutrient goals didn't apply");
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleNext() {
    if (!canAdvance()) return;
    // The custom nutrient-goals step is terminal for both trees → submit.
    if (step === goalsStep) {
      handleSubmit();
      return;
    }
    if (step === 0) {
      setStep(1);
      return;
    }
    if (isManual) {
      // Macros step → custom nutrient goals.
      setStep(2);
      return;
    }
    // COACHED
    if (step === 6) {
      // Moving into preview — fetch it now.
      setStep(7);
      fetchPreview();
      return;
    }
    setStep(step + 1);
  }

  function toggleHighDay(d: number) {
    setHighDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  // Back is available on every step past the style chooser.
  const showBack = step > 0;
  const headerLeft = showBack ? (
    /* BACK */
    <Button className="btn-link" onClick={() => setStep(step - 1)} aria-label="Back" disabled={isSubmitting}>
      <ChevronLeft className="w-5 h-5" />
    </Button>
  ) : undefined;

  const footerLabel = isSubmitting
    ? "Activating program…"
    : step === goalsStep
      ? "Activate Program"
      : isCoached && step === 6
        ? "Preview"
        : "Next";

  return (
    /* SET PROGRAM WIZARD MODAL */
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Program" : "Set New Program"}
      disableClose={isSubmitting}
      fullHeight
      modalActions={headerLeft}
      subHeader={
        /* PROGRESS */
        <div className="wizard-progress" aria-label={`Step ${step + 1} of ${totalSteps}`}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span key={i} data-filled={i <= step ? "true" : "false"} />
          ))}
        </div>
      }
      footer={
        <Button
          className="btn-blue"
          onClick={handleNext}
          disabled={!canAdvance() || isSubmitting}
          style={{ width: "100%" }}
        >
          {footerLabel}
        </Button>
      }
    >
      {/* STEP 0 — PROGRAM STYLE */}
      {step === 0 && (
        <Step title="Choose your program style">
          {STYLE.map((o) => (
            <Option
              key={o.kind}
              icon={o.icon}
              title={o.label}
              desc={o.desc}
              active={programStyle === o.kind}
              onClick={() => setProgramStyle(o.kind)}
            />
          ))}
        </Step>
      )}

      {/* MANUAL STEP 1 — WEEKLY TARGETS */}
      {isManual && step === 1 && (
        <Step title="Set your targets for the week">
          <div className="text-subtle" style={{ marginBottom: "0.25rem" }}>
            Enter the daily calories and macros you want to hit each day.
          </div>

          {/* CALORIES INPUT */}
          <div className="flex flex-col gap-1">
            <label className="text-label" htmlFor="manual-calories">Calories (kcal)</label>
            <input
              id="manual-calories"
              type="number"
              inputMode="decimal"
              step="1"
              min="0"
              className="input-field"
              value={manualCalories}
              onChange={(e) => setManualCalories(e.target.value)}
              onFocus={selectOnFocus}
              onKeyDown={focusOnEnter("manual-protein")}
              placeholder="0"
            />
          </div>

          {/* PROTEIN INPUT */}
          <div className="flex flex-col gap-1">
            <label className="text-label" htmlFor="manual-protein">Protein (g)</label>
            <input
              id="manual-protein"
              type="number"
              inputMode="decimal"
              step="1"
              min="0"
              className="input-field"
              value={manualProtein}
              onChange={(e) => setManualProtein(e.target.value)}
              onFocus={selectOnFocus}
              onKeyDown={focusOnEnter("manual-carbs")}
              placeholder="0"
            />
          </div>

          {/* CARBS INPUT */}
          <div className="flex flex-col gap-1">
            <label className="text-label" htmlFor="manual-carbs">Carbs (g)</label>
            <input
              id="manual-carbs"
              type="number"
              inputMode="decimal"
              step="1"
              min="0"
              className="input-field"
              value={manualCarbs}
              onChange={(e) => setManualCarbs(e.target.value)}
              onFocus={selectOnFocus}
              onKeyDown={focusOnEnter("manual-fat")}
              placeholder="0"
            />
          </div>

          {/* FAT INPUT */}
          <div className="flex flex-col gap-1">
            <label className="text-label" htmlFor="manual-fat">Fat (g)</label>
            <input
              id="manual-fat"
              type="number"
              inputMode="decimal"
              step="1"
              min="0"
              className="input-field"
              value={manualFat}
              onChange={(e) => setManualFat(e.target.value)}
              onFocus={selectOnFocus}
              onKeyDown={blurOnEnter}
              placeholder="0"
            />
          </div>
        </Step>
      )}

      {/* COACHED STEP 1 — PROTEIN */}
      {isCoached && step === 1 && (
        <Step title="What is your preferred protein intake?">
          {PROTEIN.map((o) => (
            <Option
              key={o.kind}
              icon={o.icon}
              title={o.label}
              desc={o.desc}
              active={proteinBand === o.kind}
              onClick={() => setProteinBand(o.kind)}
            />
          ))}
        </Step>
      )}

      {/* COACHED STEP 2 — DIET */}
      {isCoached && step === 2 && (
        <Step title="What is your preferred diet?">
          {DIET.map((o) => (
            <Option
              key={o.kind}
              icon={o.icon}
              title={o.label}
              desc={o.desc}
              active={dietKind === o.kind}
              onClick={() => setDietKind(o.kind)}
            />
          ))}
        </Step>
      )}

      {/* COACHED STEP 3 — TRAINING */}
      {isCoached && step === 3 && (
        <Step title="What training will you do during this program?">
          {TRAINING.map((o) => (
            <Option
              key={o.kind}
              icon={o.icon}
              title={o.label}
              active={trainingKind === o.kind}
              onClick={() => setTrainingKind(o.kind)}
            />
          ))}
        </Step>
      )}

      {/* COACHED STEP 4 — DISTRIBUTION */}
      {isCoached && step === 4 && (
        <Step title="How would you like to distribute Calories throughout the week?">
          {DISTRIBUTION.map((o) => (
            <Option
              key={o.kind}
              icon={o.icon}
              title={o.label}
              desc={o.desc}
              active={distributionKind === o.kind}
              onClick={() => setDistributionKind(o.kind)}
            />
          ))}

          {/* HIGH-DAY PICKER */}
          {distributionKind === "shifted" && (
            <div className="card" style={{ marginTop: "1rem" }}>
              <div className="card-content">
                <div className="text-label" style={{ marginBottom: "0.5rem" }}>High-calorie days</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                  {WEEKDAYS.map((w) => (
                    <Button
                      key={w.num}
                      className={highDays.includes(w.num) ? "btn-blue" : "btn-off"}
                      onClick={() => toggleHighDay(w.num)}
                    >
                      {w.label}
                    </Button>
                  ))}
                </div>
                <div className="text-subtle" style={{ marginTop: "0.5rem" }}>
                  Pick 1–6 days. Remaining days will be lower-calorie to balance the week.
                </div>
              </div>
            </div>
          )}
        </Step>
      )}

      {/* COACHED STEP 5 — FLOOR */}
      {isCoached && step === 5 && (
        <Step title="What calorie floor do you prefer?">
          {FLOOR.map((o) => (
            <Option
              key={o.kind}
              icon={o.icon}
              title={o.label}
              desc={o.desc}
              active={floorKind === o.kind}
              onClick={() => setFloorKind(o.kind)}
            />
          ))}
        </Step>
      )}

      {/* COACHED STEP 6 — CHECK-IN DAY */}
      {isCoached && step === 6 && (
        <Step title="When should we check in and re-balance your targets?">
          {WEEKDAYS.map((w) => (
            <Option
              key={w.num}
              title={w.label === "Mon" ? "Monday" : w.label === "Tue" ? "Tuesday" : w.label === "Wed" ? "Wednesday" : w.label === "Thu" ? "Thursday" : w.label === "Fri" ? "Friday" : w.label === "Sat" ? "Saturday" : "Sunday"}
              active={checkInDay === w.num}
              onClick={() => setCheckInDay(w.num)}
            />
          ))}
        </Step>
      )}

      {/* COACHED STEP 7 — READY PREVIEW */}
      {isCoached && step === 7 && (
        <div>
          <h2 className="text-card-title" style={{ marginBottom: "1rem" }}>Your macro program is ready</h2>

          {isLoadingPreview && (
            /* LOADING */
            <div className="loading-container"><div className="loading-spinner" /></div>
          )}

          {preview && (
            <>
              {/* RIBBON */}
              <MacroRibbon
                target={{ kcal: preview.kcal, protein_g: preview.protein_g, fat_g: preview.fat_g, carbs_g: preview.carbs_g }}
                shiftedHighDays={distributionKind === "shifted" ? highDays : null}
              />

              {/* DESIGN STEPS */}
              <div className="step-list" style={{ marginTop: "1.5rem" }}>

                {/* STEP — EXPENDITURE */}
                <div className="step-list-item">
                  <span className="step-list-num">1</span>
                  <div className="step-list-body">
                    <div className="step-list-title">Estimated Expenditure</div>
                    <div className="step-list-value" data-kind="cal">
                      {preview.maintenance_kcal ?? "—"} kcal
                    </div>
                    <div className="step-list-desc">
                      Based on your latest weigh-in
                      {preview.latest_weight_lb != null ? ` of ${lbInUnit(preview.latest_weight_lb, weightUnit).toFixed(1)} ${unitLabel(weightUnit)}` : ""},
                      we estimate your daily energy expenditure at roughly {preview.maintenance_kcal ?? "—"} kcal.
                    </div>
                  </div>
                </div>

                {/* STEP — AVERAGE TARGET */}
                <div className="step-list-item">
                  <span className="step-list-num">2</span>
                  <div className="step-list-body">
                    <div className="step-list-title">Average Target</div>
                    <div className="step-list-value" data-kind="cal">{preview.kcal} kcal</div>
                    <div className="step-list-desc">
                      Your goal is {GOAL_VERB_PAST[preview.goal_kind]} weight
                      {preview.rate_lb_per_week ? ` at ${lbInUnit(preview.rate_lb_per_week, weightUnit).toFixed(weightUnit === "lbs" ? 1 : 2)} ${wkLabel}` : ""}, so your daily
                      average should be around {preview.kcal} kcal.
                    </div>
                  </div>
                </div>

                {/* STEP — PROTEIN */}
                <div className="step-list-item">
                  <span className="step-list-num">3</span>
                  <div className="step-list-body">
                    <div className="step-list-title">Target Protein</div>
                    <div className="step-list-value" data-kind="protein">
                      {preview.protein_g} g
                      {preview.latest_weight_lb != null && (
                        <span className="text-subtle" style={{ fontWeight: 400, marginLeft: "0.375rem" }}>
                          · {(preview.protein_g / lbInUnit(preview.latest_weight_lb, weightUnit)).toFixed(2)} g/{unitLabel(weightUnit)}
                        </span>
                      )}
                    </div>
                    <div className="step-list-desc">
                      Given your {PROTEIN_LABEL[proteinBand!].toLowerCase()} protein preference and weight, this is a
                      solid daily protein floor.
                    </div>
                  </div>
                </div>

                {/* STEP — DIET */}
                <div className="step-list-item">
                  <span className="step-list-num">4</span>
                  <div className="step-list-body">
                    <div className="step-list-title">Diet Type</div>
                    <div className="step-list-value" data-kind="diet">{DIET_LABEL[dietKind!]}</div>
                    <div className="step-list-desc">
                      Your remaining calories are split between carbs ({preview.carbs_g} g) and fat ({preview.fat_g} g)
                      to match the {DIET_LABEL[dietKind!]} diet style.
                    </div>
                  </div>
                </div>
              </div>

              {/* WHAT'S NEXT */}
              <div style={{ marginTop: "1.5rem" }}>
                <h3 className="text-card-title" style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>What's next</h3>
                <p className="text-subtle">
                  We'll monitor your intake and weight trend. Each {WEEKDAYS[checkInDay - 1].label} we'll re-balance
                  these targets to keep you on track with your goal.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* CUSTOM NUTRIENT GOALS — final step for both trees */}
      {step === goalsStep && (
        <ProgramNutrientGoals
          nutrients={nutrients}
          rows={goalRows}
          onChange={setGoalRows}
          isLoading={isLoadingNutrients}
        />
      )}
    </Modal>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    /* STEP */
    <div>
      <h2 className="text-card-title" style={{ marginBottom: "1rem" }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>{children}</div>
    </div>
  );
}

function Option({
  icon: Icon,
  title,
  desc,
  active,
  onClick,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  desc?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    /* OPTION */
    <button type="button" className="option-card" aria-pressed={active} onClick={onClick}>
      {Icon && <Icon className="option-card-icon w-6 h-6" />}
      <div className="option-card-body">
        <div className="option-card-title">{title}</div>
        {desc && <div className="option-card-desc">{desc}</div>}
      </div>
      <span className="option-card-radio" />
    </button>
  );
}
