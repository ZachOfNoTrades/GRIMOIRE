"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Toaster } from "react-hot-toast";
import {
  Plus, Pencil, CalendarClock, Target, Hourglass, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { Goal } from "../../types/goal";
import { Program } from "../../types/program";
import { MacroTarget } from "../../types/target";
import { isCheckInDue } from "../../lib/program";
import { WeightEntry } from "../../types/weight";
import SetGoalWizard from "./SetGoalWizard";
import SetProgramWizard from "./SetProgramWizard";
import CheckInWizard from "./CheckInWizard";
import LogWeighInModal from "./LogWeighInModal";
import MacroRibbon from "./MacroRibbon";
import { lbInUnit, unitLabel } from "../../utils/units";
import { useWeightUnit } from "../../utils/useWeightUnit";
import ForageBottomBar from "../ForageBottomBar";
import { useAppHeight } from "@/lib/useAppHeight";
import "./strategy.css";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[dt.getMonth()]} ${dt.getDate()}`;
}

function fmtDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[dt.getMonth()]} ${dt.getDate()}, ${y}`;
}

function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

// Normalize a single-record API response: a real record passes through; null or
// an error envelope (`{ error: ... }`, returned on a 500) collapses to null.
function record<T>(value: any): T | null {
  if (value && typeof value === "object" && "error" in value) return null;
  return (value ?? null) as T | null;
}

function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return ((dt.getUTCDay() + 6) % 7) + 1; // 1=Mon..7=Sun
}

function daysUntilWeekday(targetWd: number, todayWd: number): number {
  const diff = (targetWd - todayWd + 7) % 7;
  return diff === 0 ? 7 : diff;
}

// Weigh-ins shown before the "Show all" toggle — a long-running log runs to
// hundreds of rows, which would bury everything above it.
const WEIGH_IN_PAGE_SIZE = 10;

const WEEKDAY_LABELS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const GOAL_LABEL: Record<string, string> = {
  lose: "Weight Loss Goal", maintain: "Maintain Goal", gain: "Weight Gain Goal",
};
const GOAL_VERB: Record<string, string> = {
  lose: "Lose", maintain: "Maintain", gain: "Gain",
};

export default function ForageStrategyPage() {
  // Suspense boundary is required by Next 15: any client component that calls
  // useSearchParams() during static prerender must be wrapped (matches
  // ui/foods/page.tsx's ?date=/?add= deep-link pattern).
  return (
    <Suspense fallback={<div className="loading-container"><div className="loading-spinner" /></div>}>
      <ForageStrategyPageInner />
    </Suspense>
  );
}

function ForageStrategyPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const weightUnit = useWeightUnit();
  const uLabel = unitLabel(weightUnit);

  // Lock the shell to the real visible viewport so the bottom tab bar sits flush
  // (Firefox Android handling lives in lib/useAppHeight).
  useAppHeight();

  // DATA
  const [goal, setGoal] = useState<Goal | null>(null);
  const [program, setProgram] = useState<Program | null>(null);
  const [target, setTarget] = useState<MacroTarget | null>(null);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [goalHistory, setGoalHistory] = useState<Goal[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [goalWizardOpen, setGoalWizardOpen] = useState(false);
  const [programWizardOpen, setProgramWizardOpen] = useState(false);
  const [checkInPickerOpen, setCheckInPickerOpen] = useState(false);
  const [checkInWizardOpen, setCheckInWizardOpen] = useState(false);
  // Bumped after a check-in completes so the bottom bar re-fetches the Strategy
  // tab due-dot in place (completing the wizard doesn't switch tabs).
  const [checkinRefreshKey, setCheckinRefreshKey] = useState(0);
  // Weigh-in history: the entry being edited (null = modal closed) and whether
  // the list is showing everything or just the most recent page of it.
  const [editingWeighIn, setEditingWeighIn] = useState<WeightEntry | null>(null);
  const [showAllWeighIns, setShowAllWeighIns] = useState(false);
  const weighInsRef = useRef<HTMLHeadingElement | null>(null);

  async function refresh() {
    setIsLoading(true);
    try {
      const [g, p, t, w, gh] = await Promise.all([
        fetch(`/modules/forage/api/goal`).then((r) => r.json()),
        fetch(`/modules/forage/api/program`).then((r) => r.json()),
        fetch(`/modules/forage/api/targets`).then((r) => r.json()),
        fetch(`/modules/forage/api/weight`).then((r) => r.json()),
        fetch(`/modules/forage/api/goal/history`).then((r) => r.json()),
      ]);
      // An errored endpoint returns a truthy `{ error }` object — coerce those to
      // null so a transient 500 (e.g. DB pressure) can't masquerade as a real
      // record. Otherwise an error object would satisfy `goal && program` and
      // render an "Edit Program" button whose prefill has no real values.
      setGoal(record<Goal>(g));
      setProgram(record<Program>(p));
      setTarget(record<MacroTarget>(t));
      setWeights(Array.isArray(w) ? w : []);
      setGoalHistory(Array.isArray(gh) ? gh : []);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  // Deep-link from the home dashboard's check-in banner (?checkin=1) opens the
  // wizard directly. Opens unconditionally — the wizard's own preview fetch is
  // the source of truth for eligibility, avoiding a race with the home page's
  // SSR-computed due state going stale by the time the user lands here.
  useEffect(() => {
    if (searchParams?.get("checkin") === "1") {
      setCheckInWizardOpen(true);
      router.replace("/modules/forage/ui/strategy");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  // Deep-link from the dashboard's Body Metrics cards (?view=weigh-ins). The
  // history sits below the goal cards, so scroll it into view once the page has
  // finished loading — a plain #hash can't do this, the scroll container is the
  // inner .page-scroll rather than the document.
  useEffect(() => {
    if (isLoading || searchParams?.get("view") !== "weigh-ins") return;
    weighInsRef.current?.scrollIntoView({ block: "start" });
    router.replace("/modules/forage/ui/strategy");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, searchParams, router]);

  // Newest-first weigh-ins. Used for goal pctBw and for resolving start/end
  // weights of each goal in the history list.
  const sorted = useMemo(
    () => [...weights].sort((a, b) => (a.log_date < b.log_date ? 1 : -1)),
    [weights]
  );
  const latest = sorted[0];

  // Check-in countdown — only coached programs have a weekly check-in. The
  // check-in stays "due" from its weekday onward until it is actually completed,
  // so a missed (late) check-in keeps prompting instead of disappearing until
  // the following week (shares isCheckInDue with the lazy recompute + home banner).
  // On the check-in weekday itself, GET /api/program's lazy recompute has
  // typically already stamped last_checkin_date=today by the time this renders,
  // so isCheckInDue is already false — without this branch daysUntilWeekday's
  // same-weekday case (diff=0, mapped to 7 for "next week") would misleadingly
  // read as "7 DAYS · until check-in" on the very day you checked in.
  const checkIn = useMemo(() => {
    if (!program || program.program_style !== "coached") return null;
    const checkInWeekday = program.check_in_weekday!;
    const today = todayIso();
    const todayWd = isoWeekday(today);
    if (isCheckInDue(checkInWeekday, program.last_checkin_date, today)) {
      return { state: "due" as const, days: 0, label: "It's time" };
    }
    if (todayWd === checkInWeekday) {
      return { state: "done" as const, days: 0, label: "Checked in today" };
    }
    return {
      state: "pending" as const,
      days: daysUntilWeekday(checkInWeekday, todayWd),
      label: "Until check-in",
    };
  }, [program]);

  // Goal stat figures. `rate` is rendered in the display unit; %BW is unit-invariant.
  const goalStats = useMemo(() => {
    if (!goal || !latest) return null;
    const rateLb = goal.rate_lb_per_week ?? 0;
    const rateDisplay = lbInUnit(rateLb, weightUnit);
    const weightDisplay = lbInUnit(latest.weight_lb, weightUnit);
    const pctBw = weightDisplay > 0 ? (rateDisplay / weightDisplay) * 100 : 0;
    return { rateDisplay, pctBw };
  }, [goal, latest, weightUnit]);

  // All goals, newest first, including the active one — rendered MacroFactor-
  // style with start/end weight transitions.
  const allGoals = useMemo(
    () => [...goalHistory].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [goalHistory]
  );

  // Resolve the weigh-in closest to a given date (ISO yyyy-mm-dd). Used to
  // render the goal-history start/end weight transition. Sorted ascending by
  // distance; returns null if there are no weigh-ins.
  const weightAt = (iso: string): WeightEntry | null => {
    if (sorted.length === 0) return null;
    const target = new Date(iso + "T00:00:00Z").getTime();
    let best = sorted[0];
    let bestDist = Math.abs(new Date(best.log_date + "T00:00:00Z").getTime() - target);
    for (const w of sorted) {
      const dist = Math.abs(new Date(w.log_date + "T00:00:00Z").getTime() - target);
      if (dist < bestDist) { best = w; bestDist = dist; }
    }
    return best;
  };

  return (
    /* PAGE — locked shell with an inner scroll region so the bottom tab bar
       stays pinned (matches the dashboard / food-log layout). */
    <div className="page-with-bottom-bar">

      {/* PAGE SCROLL — the only scrollable surface. */}
      <div className="page-scroll">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* PAGE TITLE */}
        <h1 className="text-page-title s-page-title-terminal">
          <Target className="w-6 h-6" /> Strategy
        </h1>

        {isLoading ? (
          /* LOADING */
          <div className="loading-container"><div className="loading-spinner" /></div>
        ) : (
          <>
            {/* QUICK ACTION PILLS */}
            <div className="s-pill-row">
              {goal ? (
                <Button className="btn-off" onClick={() => setGoalWizardOpen(true)}>
                  <Pencil className="w-4 h-4" /> Edit Goal
                </Button>
              ) : (
                <Button className="btn-blue" onClick={() => setGoalWizardOpen(true)}>
                  <Plus className="w-4 h-4" /> New Goal
                </Button>
              )}
              {goal && program && (
                <Button className="btn-off" onClick={() => setProgramWizardOpen(true)}>
                  <Pencil className="w-4 h-4" /> Edit Program
                </Button>
              )}
              {goal && !program && (
                <Button className="btn-blue" onClick={() => setProgramWizardOpen(true)}>
                  <Plus className="w-4 h-4" /> New Program
                </Button>
              )}
              {program && program.program_style === "coached" && (
                <Button className="btn-off" onClick={() => setCheckInPickerOpen(true)}>
                  <CalendarClock className="w-4 h-4" /> Change Check-In Day
                </Button>
              )}
            </div>

            {/* CHECK-IN RING HERO */}
            {program && program.program_style === "coached" && checkIn && (
              /* CHECK-IN RING */
              <div className="s-checkin-hero">
                <div
                  className="checkin-ring"
                  data-state={checkIn.state === "due" || checkIn.state === "done" ? checkIn.state : undefined}
                  role={checkIn.state === "due" ? "button" : undefined}
                  tabIndex={checkIn.state === "due" ? 0 : undefined}
                  onClick={checkIn.state === "due" ? () => setCheckInWizardOpen(true) : undefined}
                  onKeyDown={checkIn.state === "due" ? (e) => { if (e.key === "Enter" || e.key === " ") setCheckInWizardOpen(true); } : undefined}
                >
                  {checkIn.state === "due" ? (
                    <div className="checkin-ring-value s-checkin-checkin-value">CHECK IN</div>
                  ) : checkIn.state === "done" ? (
                    <>
                      <div className="checkin-ring-value s-checkin-due-value">DONE</div>
                      <div className="checkin-ring-label">checked in today</div>
                    </>
                  ) : (
                    <>
                      <div className="checkin-ring-value">{checkIn.days} {checkIn.days === 1 ? "DAY" : "DAYS"}</div>
                      <div className="checkin-ring-label">{checkIn.label.toLowerCase()}</div>
                    </>
                  )}
                </div>

                {/* BADGE ROW */}
                <div className="s-checkin-badge-row">
                  <span className="s-checkin-badge" data-kind="goal">
                    <Target className="w-4 h-4" /> {GOAL_VERB[goal!.goal_kind] || "Goal"}
                  </span>
                  <span className="s-checkin-badge" data-kind="day">
                    <CalendarClock className="w-4 h-4" /> {WEEKDAY_LABELS[program.check_in_weekday!]}
                  </span>
                </div>
              </div>
            )}

            {!program && !goal && (
              /* EMPTY HERO */
              <div className="card s-card-spaced">
                <div className="card-content">
                  <div className="empty-state">
                    <div className="empty-state-title">No plan yet</div>
                    <div className="empty-state-body">
                      Set a goal and pick a program. We'll compute your daily targets from your weigh-ins and re-balance them each week.
                    </div>
                    <Button className="btn-blue s-empty-cta" onClick={() => setGoalWizardOpen(true)}>
                      <Plus className="w-4 h-4" /> Set New Goal
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {goal && !program && (
              /* GOAL SET, NEEDS PROGRAM */
              <div className="card s-card-spaced">
                <div className="card-content">
                  <div className="empty-state">
                    <div className="empty-state-title">Goal set — now build a program</div>
                    <div className="empty-state-body">
                      You're set to <span className="s-empty-emphasis">{GOAL_VERB[goal.goal_kind].toLowerCase()}</span>
                      {goal.rate_lb_per_week ? ` at ${lbInUnit(goal.rate_lb_per_week, weightUnit).toFixed(weightUnit === "lbs" ? 1 : 2)} ${uLabel}/wk` : ""}. Configure protein, diet,
                      training and check-in day to compute daily targets.
                    </div>
                    <Button className="btn-blue s-empty-cta" onClick={() => setProgramWizardOpen(true)}>
                      <Plus className="w-4 h-4" /> Set New Program
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* IN PROGRESS SECTION */}
            {(program || goal) && (
              <div className="s-card-spaced-tight">
                <h2 className="text-section-title s-section-title">In Progress</h2>
              </div>
            )}

            {/* PROGRAM CARD */}
            {program && target && (
              <div className="card s-card-spaced">
                <div className="card-header s-card-header-block">
                  <h2 className="text-card-title">{program.program_style === "manual" ? "Manual Program" : "Coached Program"}</h2>
                  <span className="text-subtle">{fmtDate(program.created_at.slice(0, 10))} – Now</span>
                </div>

                <div className="card-content">
                  {/* MACRO WEEK RIBBON */}
                  <MacroRibbon target={target} shiftedHighDays={program.distribution_kind === "shifted" ? program.shifted_high_days : null} />
                </div>
              </div>
            )}

            {/* GOAL CARD */}
            {goal && (
              <div className="card s-card-spaced">
                <div className="card-header s-card-header-block">
                  <h2 className="text-card-title">{GOAL_LABEL[goal.goal_kind]}</h2>
                  <span className="text-subtle">{fmtDate(goal.created_at.slice(0, 10))} – Now</span>
                </div>

                <div className="card-content">
                  {/* STAT CLUSTER */}
                  {goalStats && goal.goal_kind !== "maintain" && (
                    <div className="s-goal-stats">
                      {/* GOAL WEIGHT */}
                      {goal.target_weight_lb != null && (
                        <div className="s-goal-stat">
                          <div className="s-goal-stat-row">
                            <span className="s-goal-stat-value">
                              {lbInUnit(goal.target_weight_lb, weightUnit).toFixed(0)}
                            </span>
                            <span className="s-goal-stat-unit">{uLabel}</span>
                          </div>
                          <div className="s-goal-stat-label">Goal Weight</div>
                        </div>
                      )}

                      {/* RATE PER WEEK */}
                      <div className="s-goal-stat">
                        <div className="s-goal-stat-row">
                          <span className="s-goal-stat-value">
                            {goal.goal_kind === "lose" ? "-" : "+"}{goalStats.rateDisplay.toFixed(2)}
                          </span>
                          <span className="s-goal-stat-unit">{uLabel}</span>
                        </div>
                        <div className="s-goal-stat-label">Goal Rate</div>
                      </div>

                      {/* RATE PCT BW */}
                      <div className="s-goal-stat">
                        <div className="s-goal-stat-row">
                          <span className="s-goal-stat-value">
                            {goal.goal_kind === "lose" ? "-" : "+"}{goalStats.pctBw.toFixed(1)}
                          </span>
                          <span className="s-goal-stat-unit">%</span>
                        </div>
                        <div className="s-goal-stat-label">Goal Rate</div>
                      </div>
                    </div>
                  )}

                  {goal.goal_kind === "maintain" && (
                    /* MAINTAIN COPY */
                    <div className="text-subtle">
                      Targets hold steady around your maintenance estimate; the check-in re-balances if your weight drifts.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* GOAL HISTORY (includes active goal at top) */}
            {allGoals.length > 0 && (
              <>
                {/* GOAL HISTORY HEADING */}
                <h2 className="text-section-title s-section-title s-goal-history-heading">Goal History</h2>

                {/* GOAL HISTORY LIST */}
                <div className="s-goal-history-list">
                  {allGoals.map((g) => {
                    const startW = weightAt(g.created_at.slice(0, 10));
                    const endW = g.ended_at ? weightAt(g.ended_at.slice(0, 10)) : null;
                    const active = g.ended_at == null;
                    const startStr = startW
                      ? `${lbInUnit(startW.weight_lb, weightUnit).toFixed(1)} ${uLabel}`
                      : null;
                    const endStr = endW
                      ? `${lbInUnit(endW.weight_lb, weightUnit).toFixed(1)} ${uLabel}`
                      : null;
                    return (
                      /* GOAL HISTORY ROW */
                      <div key={g.id} className="s-goal-history-row">

                        {/* MAIN */}
                        <div className="s-goal-history-main">
                          <div className="s-goal-history-date">
                            {fmtDateLong(g.created_at.slice(0, 10))} – {g.ended_at ? fmtDateLong(g.ended_at.slice(0, 10)) : "Now"}
                          </div>
                          <div className="s-goal-history-weights">
                            {startStr && <span className="s-goal-history-weight">{startStr}</span>}
                            {endStr && (
                              <>
                                <span className="s-goal-history-to">to</span>
                                <span className="s-goal-history-weight">{endStr}</span>
                              </>
                            )}
                            {!startStr && <span className="s-goal-history-to">—</span>}
                          </div>
                        </div>

                        {/* KIND + STATUS ICON */}
                        <div className="s-goal-history-kind">
                          <span className="s-goal-history-verb">{GOAL_VERB[g.goal_kind]}</span>
                          {active
                            ? <Hourglass className="w-5 h-5 s-goal-history-icon" />
                            : <CheckCircle2 className="w-5 h-5 s-goal-history-icon s-goal-history-icon-done" />
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* WEIGH-IN HISTORY — the "See All" / Body Metrics destination from the
                dashboard. Also the only place a logged weigh-in (and its body-fat
                reading) can be corrected or removed after the fact. */}
            <h2 ref={weighInsRef} className="text-section-title s-section-title s-goal-history-heading">Weigh-In History</h2>

            {sorted.length === 0 ? (
              /* WEIGH-IN EMPTY */
              <div className="text-subtle">No weigh-ins logged yet — use the + button to log one.</div>
            ) : (
              <>
                {/* WEIGH-IN LIST */}
                <div className="s-goal-history-list">
                  {(showAllWeighIns ? sorted : sorted.slice(0, WEIGH_IN_PAGE_SIZE)).map((w) => (
                    /* WEIGH-IN ROW */
                    <button
                      key={w.log_date}
                      type="button"
                      className="s-weighin-row"
                      onClick={() => setEditingWeighIn(w)}
                      aria-label={`Edit weigh-in from ${fmtDateLong(w.log_date)}`}
                    >
                      {/* DATE */}
                      <span className="s-weighin-date">{fmtDateLong(w.log_date)}</span>

                      {/* FIGURES */}
                      <span className="s-weighin-figures">

                        {/* BODY FAT — only when the entry carries a reading */}
                        {w.body_fat_pct != null && (
                          <span className="s-weighin-bf">{w.body_fat_pct.toFixed(1)}% BF</span>
                        )}

                        {/* WEIGHT */}
                        <span className="s-weighin-weight">
                          {lbInUnit(w.weight_lb, weightUnit).toFixed(1)} {uLabel}
                        </span>

                        <Pencil className="w-4 h-4 s-weighin-icon" />
                      </span>
                    </button>
                  ))}
                </div>

                {/* SHOW ALL / SHOW LESS — the list can run to hundreds of entries. */}
                {sorted.length > WEIGH_IN_PAGE_SIZE && (
                  <Button className="btn-off s-weighin-more" onClick={() => setShowAllWeighIns((v) => !v)}>
                    {showAllWeighIns ? "Show less" : `Show all ${sorted.length}`}
                  </Button>
                )}
              </>
            )}

          </>
        )}

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>

      </div>

      {/* BOTTOM BAR — no search on strategy; FAB opens the shared Shortcuts
          sheet. A weigh-in logged from there refreshes the page in place. */}
      <ForageBottomBar active="strategy" onWeighIn={refresh} checkinRefreshKey={checkinRefreshKey} />

      {/* SET GOAL WIZARD */}
      {goalWizardOpen && (
        <SetGoalWizard
          isOpen={goalWizardOpen}
          onClose={() => setGoalWizardOpen(false)}
          onComplete={() => {
            // CHAIN INTO PROGRAM WIZARD — only when no active program exists,
            // so editing a goal under an existing program doesn't reopen the
            // program wizard. Per-snapshot of `program` is fine; a program
            // cannot be created while the goal modal is open.
            const needsProgram = !program;
            setGoalWizardOpen(false);
            if (needsProgram) setProgramWizardOpen(true);
            refresh();
          }}
        />
      )}

      {/* SET PROGRAM WIZARD — prefilled with the current program + target when
          editing; blank when creating a new program (program is null). */}
      {programWizardOpen && (
        <SetProgramWizard
          isOpen={programWizardOpen}
          onClose={() => setProgramWizardOpen(false)}
          onComplete={() => { setProgramWizardOpen(false); refresh(); }}
          existingProgram={program}
          existingTarget={target}
        />
      )}

      {/* CHECK-IN WIZARD */}
      {checkInWizardOpen && (
        <CheckInWizard
          isOpen={checkInWizardOpen}
          onClose={() => setCheckInWizardOpen(false)}
          onComplete={() => { setCheckInWizardOpen(false); refresh(); setCheckinRefreshKey((k) => k + 1); }}
        />
      )}

      {/* EDIT WEIGH-IN MODAL — keyed on the entry so its inputs re-seed when a
          different row is opened (the modal seeds state from props on mount). */}
      {editingWeighIn && (
        <LogWeighInModal
          key={editingWeighIn.log_date}
          isOpen
          editing={editingWeighIn}
          onClose={() => setEditingWeighIn(null)}
          onSaved={() => { setEditingWeighIn(null); refresh(); }}
          onDeleted={() => { setEditingWeighIn(null); refresh(); }}
        />
      )}

      {/* CHECK-IN DAY PICKER */}
      {checkInPickerOpen && program && program.program_style === "coached" && (
        <CheckInPickerModal
          current={program.check_in_weekday!}
          onClose={() => setCheckInPickerOpen(false)}
          onPick={async (wd) => {
            await fetch(`/modules/forage/api/program/${program.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ check_in_weekday: wd }),
            });
            setCheckInPickerOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function CheckInPickerModal({
  current,
  onClose,
  onPick,
}: {
  current: number;
  onClose: () => void;
  onPick: (weekday: number) => void;
}) {
  return (
    /* CHECK-IN PICKER MODAL */
    <Modal isOpen onClose={onClose} title="Check-In Day" subHeader={<div className="text-subtle">Weekday when your targets re-balance</div>}>
      <div className="s-checkin-picker-list">
        {WEEKDAY_LABELS.slice(1).map((label, i) => {
          const wd = i + 1;
          const active = wd === current;
          return (
            <button key={wd} type="button" className="option-card" aria-pressed={active} onClick={() => onPick(wd)}>
              <div className="option-card-body">
                <div className="option-card-title">{label}</div>
              </div>
              <span className="option-card-radio" />
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
