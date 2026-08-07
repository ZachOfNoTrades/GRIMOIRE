"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { selectOnFocus, blurOnEnter } from "@/lib/inputBehavior";
import { lbInUnit, toLb, unitLabel } from "../../utils/units";
import { useWeightUnit } from "../../utils/useWeightUnit";
import { MACROS } from "../../utils/nutrientLedger";
import { nutrientColorForCategory } from "../../utils/nutrientGroups";
import { NutrientMeter, bandDisplay, fmtNutrient, ProgramTargetMark } from "../nutrition/nutrientMeter";

function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

interface WeighInStats { weighInsThisWeek: number; hasTodayWeighIn: boolean; minPerWeek: number; needsWeighIn: boolean; }
interface PartialLogDay { date: string; loggedKcal: number; targetKcal: number; pctOfTarget: number; }
interface MacroValues { kcal: number; protein_g: number; carbs_g: number; fat_g: number; }
interface MacroDiff { current: MacroValues | null; proposed: MacroValues; latestWeightLb: number | null; uncappedKcal: number | null; }
interface NutrientOverride { nutrient_id: string; code: string; floor: number | null; target: number | null; ceiling: number | null; }
// One card of the user's customized dashboard Nutrition section, averaged over
// the week the check-in covers. `category` is null for the synthetic macro cards.
interface DashboardNutrientSummary {
  key: string;
  label: string;
  unit: string;
  category: string | null;
  avgPerDay: number;
  floor: number | null;
  target: number | null;
  ceiling: number | null;
  isCustom: boolean;
}
interface DashboardNutrientReview {
  startDate: string;
  endDate: string;
  loggedDays: number;
  cards: DashboardNutrientSummary[];
}
interface CheckInPreview {
  eligible: boolean;
  reason: "no_program" | "not_coached" | "no_goal" | "not_due" | null;
  weighIns: WeighInStats;
  partialLogDays: PartialLogDay[];
  macroDiff: MacroDiff | null;
  dashboardNutrients: DashboardNutrientReview;
  nutrientOverrides: NutrientOverride[];
}

type Slide = "weighIn" | "partialLog" | "macros" | "dashboardNutrients" | "nutrients";

const REASON_LABEL: Record<string, string> = {
  no_program: "You don't have an active program yet.",
  not_coached: "Manual programs don't have a weekly check-in.",
  no_goal: "You need an active goal to check in.",
  not_due: "You're all caught up — nothing due right now.",
};

// Slides are omitted entirely (not shown-then-skipped) when not applicable —
// derived once per preview snapshot passed in.
// Same number-for-number comparison the server does before it will apply a
// check-in — used here to catch the change before the round trip.
function sameMacros(a: MacroValues, b: MacroValues): boolean {
  return a.kcal === b.kcal && a.protein_g === b.protein_g && a.carbs_g === b.carbs_g && a.fat_g === b.fat_g;
}

function slidesFor(preview: CheckInPreview): Slide[] {
  if (!preview.eligible) return [];
  const slides: Slide[] = [];
  // The weigh-in prompt keys off the WEEK's coverage (server-side
  // `needsWeighIn`, i.e. fewer than `minPerWeek` of the trailing 7 days), never
  // off whether today specifically has one — a full week of weigh-ins with a
  // bare check-in day is well-covered, and a lone same-day weigh-in is not.
  if (preview.weighIns.needsWeighIn) slides.push("weighIn");
  if (preview.partialLogDays.length > 0) slides.push("partialLog");
  slides.push("macros");
  // Week-in-review of the nutrients the user actually watches, immediately
  // before the custom-goals slide — you see how the tracked nutrients went, then
  // what their goals are. Omitted with nothing logged in the window, where every
  // row would read zero and say nothing.
  if (preview.dashboardNutrients.loggedDays > 0 && preview.dashboardNutrients.cards.length > 0) {
    slides.push("dashboardNutrients");
  }
  if (preview.nutrientOverrides.length > 0) slides.push("nutrients");
  return slides;
}

// Swatch for a dashboard card — macro cards take their ledger color, micros the
// shared category resolver, so the row matches its dashboard tile exactly.
const MACRO_CARD_COLOR: Record<string, string> = Object.fromEntries(MACROS.map((m) => [m.key as string, m.color]));

function cardColor(card: DashboardNutrientSummary): string {
  return MACRO_CARD_COLOR[card.key] ?? nutrientColorForCategory(card.key, card.category ?? "other");
}

// Lead copy for the dashboard-review slide. States the divisor outright, since
// the numbers are per-LOGGED-day averages, not per-calendar-day.
function dashboardReviewLead(review: DashboardNutrientReview): string {
  const days = review.loggedDays;
  return days === 1
    ? "Your dashboard nutrients — the one day you logged this past week."
    : `Your dashboard nutrients — daily average across the ${days} days you logged this past week.`;
}

// Lead copy for the weigh-in slide. States the week's actual coverage — the
// thing that put the slide here — instead of the old "no weigh-in today",
// which no longer describes why it's showing. When today is already logged the
// date field would overwrite it, so point at the gaps instead.
function weighInLead(stats: WeighInStats): string {
  if (stats.weighInsThisWeek === 0) {
    return `No weigh-ins in the last 7 days. Log one for a more accurate recompute, or skip.`;
  }
  const verb = stats.weighInsThisWeek === 1 ? "has" : "have";
  const coverage = `Only ${stats.weighInsThisWeek} of the last 7 days ${verb} a weigh-in — ${stats.minPerWeek} or more keeps the recompute accurate.`;
  return stats.hasTodayWeighIn
    ? `${coverage} Today's is already logged; pick another date to fill a gap, or skip.`
    : `${coverage} Log one, or skip.`;
}

export default function CheckInWizard({
  isOpen,
  onClose,
  onComplete,
}: {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const router = useRouter();
  const weightUnit = useWeightUnit();

  // DATA
  const [preview, setPreview] = useState<CheckInPreview | null>(null);
  // The slide list is frozen from the FIRST preview fetch on open — logging a
  // weigh-in mid-wizard refreshes `preview`'s content (so the macro diff
  // reflects the new weight) without reshuffling which step index means what.
  const [slides, setSlides] = useState<Slide[]>([]);

  // A mid-wizard weigh-in kicks off a background preview refresh; confirming
  // has to wait on it rather than shipping the numbers it's about to replace.
  const pendingRefresh = useRef<Promise<CheckInPreview | null> | null>(null);

  // STATE
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);
  const [isRefreshingPreview, setIsRefreshingPreview] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  // Set when the recompute moved after the user had already seen a number —
  // the macro slide then asks for a second, deliberate confirmation.
  const [macrosChanged, setMacrosChanged] = useState(false);
  const [step, setStep] = useState(0);

  // INPUT — weigh-in slide
  const [logDate, setLogDate] = useState(todayIso());
  const [weightDisplay, setWeightDisplay] = useState("");
  const [bodyFat, setBodyFat] = useState("");

  // Returns the fetched preview so callers awaiting a background refresh can
  // read the fresh numbers directly, instead of racing the `preview` state
  // (which their closure captured one render ago).
  async function fetchPreview(freezeSlides: boolean): Promise<CheckInPreview | null> {
    if (freezeSlides) setIsLoadingPreview(true);
    else setIsRefreshingPreview(true);
    setPreviewError(false);
    try {
      const res = await fetch("/modules/forage/api/checkin/preview");
      if (!res.ok) throw new Error("preview failed");
      const data: CheckInPreview = await res.json();
      setPreview(data);
      if (freezeSlides) setSlides(slidesFor(data));
      return data;
    } catch {
      setPreviewError(true);
      return null;
    } finally {
      if (freezeSlides) setIsLoadingPreview(false);
      else setIsRefreshingPreview(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setSlides([]);
    setLogDate(todayIso());
    setWeightDisplay("");
    setBodyFat("");
    setMacrosChanged(false);
    setIsConfirming(false);
    pendingRefresh.current = null;
    fetchPreview(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const currentSlide = slides[step];
  const isLastStep = step === slides.length - 1;

  // Optimistic — advances immediately rather than waiting on the round trip.
  // If a weight was entered, the save + a background preview refresh fire
  // without blocking; the macro-diff slide picks up the fresh numbers via
  // setPreview whenever that resolves, even if the user's already past it.
  // The chain is parked on `pendingRefresh` so handleConfirm can wait it out —
  // today's weigh-in feeds both the bodyweight terms and the expenditure
  // estimate, so confirming ahead of it applies a materially different target
  // than the one on screen.
  function handleSaveWeighIn() {
    const weightNum = Number(weightDisplay);
    const hasWeight = weightDisplay !== "" && Number.isFinite(weightNum) && weightNum > 0;
    setStep((s) => s + 1);
    if (!hasWeight) return;
    const weightLb = toLb(weightNum, weightUnit);
    pendingRefresh.current = fetch(`/modules/forage/api/weight`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        log_date: logDate,
        weight_lb: Math.round(weightLb * 100) / 100,
        body_fat_pct: bodyFat === "" ? null : Number(bodyFat),
      }),
    })
      .then((res) => (res.ok ? fetchPreview(false) : null))
      .catch((e) => {
        console.error("Check-in wizard: failed to log weigh-in", e);
        return null;
      });
  }

  function goToDay(date: string) {
    onClose();
    router.push(`/modules/forage/ui/foods?date=${date}`);
  }

  // AWAITS the confirm write before closing and signaling completion. The write
  // is what stamps last_checkin_date; if we let the host refresh() fire first
  // (as the old fire-and-forget did), its read-only GET /api/program races ahead
  // of the write and comes back still "due", leaving the strategy ring on
  // "CHECK IN" and the tab due-dot lit after a completed check-in. Refreshing
  // only once the write lands clears both.
  //
  // Staying open until the write answers is also what lets a moved recompute be
  // re-shown instead of silently applied — a wizard that has already closed has
  // nowhere to put "actually, it's 2,300 now". Two guards, because the numbers
  // can move either side of the request:
  //   • before — a mid-wizard weigh-in's refresh may still be in flight, so wait
  //     it out and compare against what was actually on screen at click time
  //   • after — the server recomputes independently and rejects with
  //     'stale_preview' if its answer no longer matches what we displayed
  // Either way the user lands back on the macro slide with the new numbers and
  // confirms deliberately. The button is disabled meanwhile so the wait can't
  // read as an unresponsive tap.
  async function handleConfirm() {
    const shown = preview?.macroDiff?.proposed ?? null;
    setIsConfirming(true);
    try {
      const refreshed = pendingRefresh.current ? await pendingRefresh.current : null;
      pendingRefresh.current = null;
      const latest = refreshed?.macroDiff?.proposed ?? shown;

      if (shown && latest && !sameMacros(shown, latest)) {
        showChangedMacros();
        return;
      }

      const res = await fetch("/modules/forage/api/checkin/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expected: latest }),
      });
      if (res.status === 409) {
        const body = await res.json().catch(() => null);
        if (body?.reason === "stale_preview") {
          await fetchPreview(false);
          showChangedMacros();
          return;
        }
      }
      if (!res.ok) console.error("Check-in wizard: confirm rejected", res.status);
    } catch (e) {
      console.error("Check-in wizard: failed to confirm check-in", e);
    } finally {
      setIsConfirming(false);
    }
    onClose();
    onComplete();
  }

  // Sends the user back to the macro slide to look at numbers that moved out
  // from under them (they may have already clicked past it to the nutrients
  // slide, where the change wouldn't be visible at all).
  function showChangedMacros() {
    setMacrosChanged(true);
    const macroStep = slides.indexOf("macros");
    if (macroStep >= 0) setStep(macroStep);
  }

  const footer = (() => {
    if (isLoadingPreview || previewError || !preview?.eligible) return null;
    if (currentSlide === "weighIn") {
      return (
        <div className="s-checkin-wizard-footer-row">
          <Button className="btn-link" onClick={() => setStep((s) => s + 1)}>Skip</Button>
          <Button className="btn-blue" onClick={handleSaveWeighIn}>Next</Button>
        </div>
      );
    }
    if (currentSlide === "partialLog") {
      return <Button className="btn-blue" onClick={() => setStep((s) => s + 1)}>Next</Button>;
    }
    if (currentSlide === "macros") {
      return (
        <Button
          className="btn-blue"
          disabled={isConfirming}
          onClick={isLastStep ? handleConfirm : () => setStep((s) => s + 1)}
        >
          {confirmLabel(isLastStep ? "confirm" : "next", isConfirming, macrosChanged)}
        </Button>
      );
    }
    // Review-only slides — advance, or confirm when nothing follows them.
    if (currentSlide === "dashboardNutrients") {
      return (
        <Button
          className="btn-blue"
          disabled={isConfirming}
          onClick={isLastStep ? handleConfirm : () => setStep((s) => s + 1)}
        >
          {confirmLabel(isLastStep ? "confirm" : "next", isConfirming, macrosChanged)}
        </Button>
      );
    }
    if (currentSlide === "nutrients") {
      return (
        <Button className="btn-blue" disabled={isConfirming} onClick={handleConfirm}>
          {confirmLabel("confirm", isConfirming, macrosChanged)}
        </Button>
      );
    }
    return null;
  })();

  return (
    /* CHECK-IN WIZARD MODAL */
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Weekly Check-In"
      fullHeight
      subHeader={
        slides.length > 0 ? (
          /* PROGRESS */
          <div className="wizard-progress" aria-label={`Step ${step + 1} of ${slides.length}`}>
            {slides.map((_, i) => (
              <span key={i} data-filled={i <= step ? "true" : "false"} />
            ))}
          </div>
        ) : undefined
      }
      footer={footer}
    >
      {isLoadingPreview ? (
        /* LOADING */
        <div className="loading-container"><div className="loading-spinner" /></div>
      ) : previewError ? (
        /* ERROR */
        <div className="s-checkin-wizard-empty">
          <p>Something went wrong loading your check-in. Try again in a moment.</p>
        </div>
      ) : !preview?.eligible ? (
        /* NOT APPLICABLE */
        <div className="s-checkin-wizard-empty">
          <p>{REASON_LABEL[preview?.reason ?? ""] ?? "Nothing to check in right now."}</p>
        </div>
      ) : (
        // Centers short slide content (weigh-in fields, the macro card) in the
        // available body height instead of pinning it to the top with a dead
        // gap below; modal-body's own overflow-y:auto still scrolls a slide
        // whose content (e.g. a long partial-log/nutrients list) runs taller.
        <div className="s-checkin-wizard-body">
          {currentSlide === "weighIn" && (
            /* WEIGH-IN SLIDE */
            <div className="s-checkin-wizard-slide">
              <p className="s-checkin-wizard-lead">
                {weighInLead(preview.weighIns)}
              </p>

              {/* DATE */}
              <div className="flex flex-col gap-1" style={{ marginBottom: "0.75rem" }}>
                <label className="text-label" htmlFor="ci-weigh-date">Date</label>
                <input id="ci-weigh-date" type="date" className="input-field" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
              </div>

              {/* WEIGHT + BODY FAT */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <div className="flex flex-col gap-1">
                  <label className="text-label" htmlFor="ci-weigh-value">Weight ({unitLabel(weightUnit)})</label>
                  <input id="ci-weigh-value" type="number" inputMode="decimal" step="0.1" className="input-field" value={weightDisplay} onChange={(e) => setWeightDisplay(e.target.value)} onFocus={selectOnFocus} onKeyDown={blurOnEnter} placeholder="0.0" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-label" htmlFor="ci-weigh-bf">Body fat (%)</label>
                  <input id="ci-weigh-bf" type="number" inputMode="decimal" step="0.1" className="input-field" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} onFocus={selectOnFocus} onKeyDown={blurOnEnter} placeholder="optional" />
                </div>
              </div>
            </div>
          )}

          {currentSlide === "partialLog" && (
            /* PARTIAL-LOG REVIEW SLIDE */
            <div className="s-checkin-wizard-slide">
              <p className="s-checkin-wizard-lead">These days look under-logged — tap one to fill it in.</p>
              <div className="s-checkin-wizard-list">
                {preview.partialLogDays.map((d) => (
                  /* PARTIAL DAY ROW */
                  <button key={d.date} type="button" className="s-checkin-wizard-row" onClick={() => goToDay(d.date)}>
                    <span className="s-checkin-wizard-row-main">
                      <span className="s-checkin-wizard-row-title">{d.date}</span>
                      <span className="s-checkin-wizard-row-sub">{d.loggedKcal} / {d.targetKcal} kcal</span>
                    </span>
                    <span className="s-checkin-wizard-row-pct">{d.pctOfTarget}%</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentSlide === "macros" && preview.macroDiff && (
            /* MACRO CHANGES SLIDE */
            <div className="s-checkin-wizard-slide">
              {macrosChanged && (
                /* RECOMPUTE-MOVED NOTICE */
                <div className="alert-yellow">
                  <p className="alert-title">These numbers just changed</p>
                  <p className="alert-text">
                    Your new weigh-in shifted the recompute. These are the targets that will actually
                    be applied — confirm to accept them.
                  </p>
                </div>
              )}

              <p className="s-checkin-wizard-lead">
                {isRefreshingPreview
                  ? "Updating with your new weigh-in…"
                  : preview.macroDiff.latestWeightLb != null
                    ? `Based on your latest weigh-in (${lbInUnit(preview.macroDiff.latestWeightLb, weightUnit).toFixed(1)} ${unitLabel(weightUnit)})`
                    : "No weigh-in on record — using a default estimate."}
              </p>

              <MacroHero diff={preview.macroDiff} />

              {preview.macroDiff.uncappedKcal != null && (
                /* RATE-LIMITED NOTICE */
                <div className="alert-blue">
                  <p className="alert-title">Easing into it</p>
                  <p className="alert-text">
                    Your data points at {preview.macroDiff.uncappedKcal.toLocaleString()} kcal, but a
                    check-in only moves your target so far at once. You&apos;ll keep stepping toward it
                    at the next check-ins as the estimate holds up.
                  </p>
                </div>
              )}
            </div>
          )}

          {currentSlide === "dashboardNutrients" && (
            /* DASHBOARD NUTRIENT REVIEW SLIDE */
            <div className="s-checkin-wizard-slide">
              <p className="s-checkin-wizard-lead">{dashboardReviewLead(preview.dashboardNutrients)}</p>

              {/* NUTRIENT REVIEW LIST */}
              <div className="s-checkin-nutrient-list">
                {preview.dashboardNutrients.cards.map((c) => (
                  <DashboardNutrientRow key={c.key} card={c} />
                ))}
              </div>
            </div>
          )}

          {currentSlide === "nutrients" && (
            /* CUSTOM NUTRIENT GOALS SLIDE */
            <div className="s-checkin-wizard-slide">
              <p className="s-checkin-wizard-lead">Your custom nutrient goals — unaffected by this check-in.</p>
              <div className="s-checkin-wizard-list">
                {preview.nutrientOverrides.map((o) => (
                  /* NUTRIENT OVERRIDE ROW */
                  <button
                    key={o.nutrient_id}
                    type="button"
                    className="s-checkin-wizard-row"
                    onClick={() => { onClose(); router.push(`/modules/forage/ui/nutrition/${o.code}`); }}
                  >
                    <span className="s-checkin-wizard-row-main">
                      <span className="s-checkin-wizard-row-title">{o.code}</span>
                      <span className="s-checkin-wizard-row-sub">
                        {[
                          o.floor != null ? `floor ${o.floor}` : null,
                          o.target != null ? `target ${o.target}` : null,
                          o.ceiling != null ? `ceiling ${o.ceiling}` : null,
                        ].filter(Boolean).join(" · ") || "custom"}
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// One dashboard card's week in review: name (bullseye when its band is a program
// override), the logged-day average against the band, and the same
// floor/target/ceiling meter the Nutrition page and the dashboard tile draw — so
// the review reads in the grammar the user already knows.
function DashboardNutrientRow({ card }: { card: DashboardNutrientSummary }) {
  const band = { value: card.avgPerDay, floor: card.floor, target: card.target, ceiling: card.ceiling };
  const display = bandDisplay(band, card.unit);
  const color = cardColor(card);

  return (
    /* NUTRIENT REVIEW ROW */
    <div className="s-checkin-nutrient-row">

      {/* HEAD — name + figures */}
      <div className="s-checkin-nutrient-head">

        {/* NAME + PROGRAM-TARGET GLYPH — the swatch and glyph hold their width;
            only the label ellipsizes into whatever space is left */}
        <span className="s-checkin-nutrient-name">
          <span className="tag-pill-dot" style={{ background: color }} />
          <span className="s-checkin-nutrient-label">{card.label}</span>
          {card.isCustom && <ProgramTargetMark />}
        </span>

        {/* VALUE + PERCENT */}
        <span className="s-checkin-nutrient-figures">
          <span className="s-checkin-nutrient-value">
            <b>{fmtNutrient(card.avgPerDay)}</b>{display.targetText}
          </span>
          <span className="s-checkin-nutrient-pct" style={{ color: display.pctColor }}>{display.pctText}</span>
        </span>
      </div>

      {/* METER */}
      {display.showBar && <NutrientMeter band={band} fillColor={color} />}
    </div>
  );
}

// Footer button text. "Checking…" covers the wait on an in-flight preview
// refresh plus the confirm write; after a recompute moved, the label spells out
// that the second click is accepting the NEW numbers, not re-sending the old.
function confirmLabel(kind: "next" | "confirm", isConfirming: boolean, macrosChanged: boolean): string {
  if (isConfirming) return "Checking…";
  if (kind === "next") return "Next";
  return macrosChanged ? "Apply New Targets" : "Confirm & Apply";
}

// Proportional width of each macro's share of total calories (protein/carbs
// 4 kcal/g, fat 9 kcal/g) — what the segmented bar plots, not raw grams.
function macroKcalShares(v: MacroValues): { protein: number; fat: number; carb: number } {
  const p = v.protein_g * 4, f = v.fat_g * 9, c = v.carbs_g * 4;
  const total = p + f + c || 1;
  return { protein: (p / total) * 100, fat: (f / total) * 100, carb: (c / total) * 100 };
}

// Thousands-separated, matching the app's other big-number displays.
function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function DeltaPill({ delta }: { delta: number }) {
  return (
    <span className={`s-checkin-delta-pill${delta > 0 ? " up" : " down"}`}>
      {delta > 0 ? "+" : ""}{fmt(delta)}
    </span>
  );
}

const MACRO_ROWS: Array<{ key: "protein_g" | "fat_g" | "carbs_g"; label: string; kind: "protein" | "fat" | "carb" }> = [
  { key: "protein_g", label: "Protein", kind: "protein" },
  { key: "fat_g", label: "Fat", kind: "fat" },
  { key: "carbs_g", label: "Carbs", kind: "carb" },
];

function MacroHero({ diff }: { diff: MacroDiff }) {
  const { current, proposed } = diff;
  const kcalChanged = current != null && current.kcal !== proposed.kcal;
  const kcalDelta = kcalChanged ? proposed.kcal - (current as MacroValues).kcal : null;

  // The segmented bar morphs from the current split to the proposed split on
  // mount (or whenever fresh data arrives, e.g. after a mid-wizard weigh-in
  // save) — when the two splits are identical, nothing moves, which reads as
  // "no change" far more clearly than a text label would.
  const [settled, setSettled] = useState(current == null);
  useEffect(() => {
    if (current == null) { setSettled(true); return; }
    setSettled(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setSettled(true));
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [current, proposed]);

  const shares = macroKcalShares(settled ? proposed : (current ?? proposed));

  return (
    /* MACRO HERO CARD */
    <div className="s-checkin-macro-hero">
      {/* KCAL HEADLINE — numbers share a baseline; the unit + delta live on
          their own centered line below so mixed type sizes never fight for
          the same baseline. */}
      <div className="s-checkin-hero-kcal">
        <div className="s-checkin-hero-kcal-numbers">
          {kcalChanged && <span className="s-checkin-hero-kcal-prev">{fmt(current!.kcal)}</span>}
          {kcalChanged && <ChevronRight className="w-4 h-4 s-checkin-hero-kcal-arrow" />}
          <span className="s-checkin-hero-kcal-value">{fmt(proposed.kcal)}</span>
        </div>
        <div className="s-checkin-hero-kcal-caption">
          <span className="s-checkin-hero-kcal-unit">kcal / day</span>
          {kcalDelta != null && <DeltaPill delta={kcalDelta} />}
        </div>
      </div>

      {/* SEGMENTED MACRO BAR */}
      <div className="s-checkin-macrobar">
        {MACRO_ROWS.map((r) => (
          <span
            key={r.kind}
            className="s-checkin-macrobar-seg"
            data-kind={r.kind}
            style={{ width: `${shares[r.kind]}%` }}
          />
        ))}
      </div>

      {/* MACRO STAT STRIP */}
      <div className="s-checkin-macro-strip">
        {MACRO_ROWS.map((r) => {
          const cur = current ? current[r.key] : null;
          const next = proposed[r.key];
          const changed = cur != null && cur !== next;
          const delta = changed ? next - (cur as number) : null;
          return (
            /* MACRO STAT */
            <div key={r.key} className="s-checkin-macro-stat">
              <span className="s-checkin-macro-stat-label">
                <span className="tag-pill-dot" data-kind={r.kind} />
                {r.label}
              </span>
              <span className="s-checkin-macro-stat-value">{changed ? `${cur} → ${next}` : next}g</span>
              {delta != null ? (
                <DeltaPill delta={delta} />
              ) : (
                cur != null && <span className="s-checkin-wizard-diff-nochange">no change</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
