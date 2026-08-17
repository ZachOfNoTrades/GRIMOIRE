"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Toaster } from "react-hot-toast";
import { Apple, CalendarClock, ChevronLeft, ChevronRight, Copy, ListChecks, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DiaryTimeline,
  todayIso,
  shiftDate,
  dateRelativeLabel,
  type DiaryBulkActions,
} from "../_diary";
import ForageBottomBar from "../ForageBottomBar";
import ForageDiaryDashboard from "./DiaryDashboard";
import { DailyTotals, FoodEntry } from "../../types/entry";
import { useAppHeight } from "@/lib/useAppHeight";
import "./foodlog.css";

export default function ForageFoodLogPage() {
  // Suspense boundary is required by Next 15: any client component that calls
  // useSearchParams() during static prerender must be wrapped, otherwise the
  // build bails out for this route.
  return (
    <Suspense fallback={<div className="loading-container"><div className="loading-spinner" /></div>}>
      <ForageFoodLogInner />
    </Suspense>
  );
}

function ForageFoodLogInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Lock the .page-with-bottom-bar shell to the real visible viewport so the
  // bottom action bar sits flush on Firefox Android (see lib/useAppHeight).
  useAppHeight();

  // INPUT
  // Honor a ?date=YYYY-MM-DD deep-link (e.g. navigated here right after logging
  // food from another screen via ForageBottomBar) by opening on that day;
  // otherwise default to today. Consumed once via the state initializer and
  // stripped from the URL below so a later refresh doesn't re-pin it.
  const initialDateParam = searchParams?.get("date");
  const [date, setDate] = useState<string>(
    initialDateParam && /^\d{4}-\d{2}-\d{2}$/.test(initialDateParam) ? initialDateParam : todayIso()
  );

  // STATE
  const [openAddSignal, setOpenAddSignal] = useState(0);
  const [addInitialPicker, setAddInitialPicker] = useState<"search" | "scan" | undefined>(undefined);
  // Bumped to force the timeline to refetch after ForageBottomBar logs an entry.
  const [reload, setReload] = useState(0);
  // Freshly-logged entries handed from ForageBottomBar to the timeline for an
  // optimistic paint (cleared once the timeline consumes them).
  const [pendingInsert, setPendingInsert] = useState<FoodEntry[] | null>(null);
  // The timeline's running day totals (summed from its live, optimistically-
  // painted entries), tagged with the day they're for. Drives the mini-
  // dashboard's rings/macro bars so they update alongside the timeline instead
  // of lagging behind the reloadSignal week refetch.
  const [liveTotals, setLiveTotals] = useState<{ date: string; totals: DailyTotals } | null>(null);
  // Bulk-select actions surfaced by the diary; when non-null we show selection
  // controls above the bottom bar instead of the search pill.
  const [bulkActions, setBulkActions] = useState<DiaryBulkActions | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  function triggerAdd(picker?: "search" | "scan") {
    setAddInitialPicker(picker);
    setOpenAddSignal((n) => n + 1);
  }

  const dateLabel = dateRelativeLabel(date);

  // Open the add modal when ?add=1 is in the URL (deep-link from elsewhere), and
  // strip the consumed ?add / ?date params so they don't linger or re-pin on a
  // later refresh (the ?date day was already captured in the state initializer).
  useEffect(() => {
    const wantsAdd = searchParams?.get("add") === "1";
    const hasDate = searchParams?.get("date") != null;
    if (wantsAdd) triggerAdd();
    if (wantsAdd || hasDate) {
      router.replace("/modules/forage/ui/foods");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  return (
    /* PAGE — flex column with bottom bar in flow (not position:fixed) so the
       bar stops jittering on mobile when the address bar collapses/expands.
       `forage-foodlog` caps + centers the whole page into a framed lane on
       desktop (see foodlog.css), matching the dashboard shell. */
    <div className="page-with-bottom-bar forage-foodlog">

      {/* PAGE SCROLL — the scroll surface; sits OUTSIDE page-container's padding so the scrollbar gutter doesn't make right padding > left padding. */}
      <div className="page-scroll">

      {/* PAGE CONTAINER — canonical max-width + symmetric content padding */}
      <div className="page-container">

        {/* PAGE TITLE */}
        <h1 className="text-page-title"><Apple className="w-6 h-6" /> Food log</h1>

        {/* MINI DASHBOARD — weekly calorie rings + current-day macro bars. The
            timeline feeds its live day totals in so the current day's ring/bars
            move optimistically with a log/edit/delete. */}
        <ForageDiaryDashboard date={date} onPickDate={setDate} reloadSignal={reload} liveTotals={liveTotals} />

        {/* DATE STEPPER — centered to match /home; previously misused .card-header (a card-internal flex-column wrapper) which left-aligned this row. */}
        <div className="flex items-center justify-center gap-2 mb-3">

          {/* DATE STEPPER INNER */}
          <div className="flex items-center gap-2">
            <Button className="btn-link" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">
              <ChevronLeft className="w-5 h-5" />
            </Button>

            <button
              type="button"
              className="text-h2"
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0.25rem 0.5rem", position: "relative" }}
              onClick={() => {
                // Call showPicker() exactly once — it returns undefined, so
                // `showPicker() ?? click()` would fire BOTH (double open + a
                // NotAllowedError when user activation is already spent). Fall
                // back to focus+click only when it's missing or throws.
                const el = dateInputRef.current;
                if (!el) return;
                try {
                  if (typeof el.showPicker === "function") {
                    el.showPicker();
                    return;
                  }
                } catch {
                  // fall through to focus+click
                }
                el.focus();
                el.click();
              }}
            >
              <div>{dateLabel.primary}</div>
              {dateLabel.secondary && <div className="text-subtle">{dateLabel.secondary}</div>}
              <input
                ref={dateInputRef}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ position: "absolute", inset: 0, opacity: 0, pointerEvents: "none" }}
              />
            </button>

            <Button className="btn-link" onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* TIMELINE — still rendered by the not-yet-migrated `_diary.tsx`. */}
        <DiaryTimeline
          date={date}
          openAddSignal={openAddSignal}
          addInitialPicker={addInitialPicker}
          reloadSignal={reload}
          insertEntries={pendingInsert}
          onInserted={() => setPendingInsert(null)}
          onChange={() => setReload((n) => n + 1)}
          onTotals={setLiveTotals}
          onBulkActions={setBulkActions}
        />

        {/* TOAST */}
        <Toaster position="top-center" />
      </div>

      </div>

      {/* BULK-SELECT BAR — shown only while entries are selected; the default
          search pill now lives in ForageBottomBar below. */}
      {bulkActions && (
        <div className="bottom-action-bar" role="toolbar" aria-label="Bulk selection actions">
          {/* SELECTION TOOLBAR — contextual action bar: a leading ✕ exits selection,
              the count anchors it, and the trailing group holds the select-all toggle
              and the destructive Delete. On desktop the whole cluster shrinks to its
              natural width (sm:w-auto) so the bar's justify-center centers it; mobile
              spans full width with the leading/trailing groups pushed to the edges. */}
          <div className="flex items-center justify-between gap-2 w-full min-w-0 sm:w-auto sm:gap-8">

            {/* LEADING — cancel selection + live count. min-w-0 lets this group be the
                one that gives way on a narrow phone, so the destructive Delete on the
                far right can never be pushed past the viewport edge. */}
            <div className="flex items-center gap-1.5 min-w-0">

              {/* CANCEL — leaves selection mode without deleting anything */}
              <Button className="btn-link shrink-0" onClick={bulkActions.onClear} disabled={bulkActions.isBusy} aria-label="Cancel selection">
                <X className="w-5 h-5" />
              </Button>

              {/* COUNT — selected total, tabular so it doesn't jump as it changes. Truncates
                  rather than overflowing once the actions need the space (<360px). */}
              <span className="text-primary whitespace-nowrap truncate" style={{ fontSize: "0.9375rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {bulkActions.count} selected
              </span>
            </div>

            {/* TRAILING — select-all toggle + move/copy/delete. shrink-0 keeps every action
                at its natural size; the leading count absorbs the squeeze instead. */}
            <div className="flex items-center gap-1 shrink-0 sm:gap-2">

              {/* SELECT ALL — toggles every entry logged for the day. Icon-only on
                  phones to save room; the label joins it once there's space (≥sm). */}
              <Button className="btn-link" onClick={bulkActions.onSelectAll} disabled={bulkActions.isBusy} aria-label={bulkActions.allSelected ? "Deselect all" : "Select all"}>
                <ListChecks className="w-4 h-4" />
                <span className="hidden sm:inline">{bulkActions.allSelected ? "Deselect all" : "Select all"}</span>
              </Button>

              {/* MOVE — relocate the selected entries to a chosen day/time. Icon-only
                  on phones; label joins at ≥sm to keep the bar from overflowing. */}
              <Button
                className="btn-link"
                onClick={bulkActions.onMove}
                disabled={bulkActions.isBusy}
                aria-label="Move selected"
                title="Move the selected entries to another day — set a time to stamp them all at once, or leave it blank to keep each entry's own time"
              >
                <CalendarClock className="w-4 h-4" />
                <span className="hidden sm:inline">Move</span>
              </Button>

              {/* COPY — duplicate the selected entries to a chosen day/time. */}
              <Button
                className="btn-link"
                onClick={bulkActions.onCopy}
                disabled={bulkActions.isBusy}
                aria-label="Copy selected"
                title="Copy the selected entries to another day — set a time to stamp them all at once, or leave it blank to keep each entry's own time"
              >
                <Copy className="w-4 h-4" />
                <span className="hidden sm:inline">Copy</span>
              </Button>

              {/* DELETE — removes the selected entries (immediate, matching single-entry delete).
                  Icon-only on phones like its siblings; the label joins at ≥sm. Keeping the label
                  on mobile is what pushed the button off the right edge of the viewport. */}
              <Button
                className="btn-red"
                onClick={bulkActions.onDelete}
                disabled={bulkActions.isBusy}
                aria-label={bulkActions.isDeleting ? "Deleting selected" : "Delete selected"}
                title="Delete the selected entries"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">{bulkActions.isDeleting ? "Deleting..." : "Delete"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM BAR — search pill (hidden during bulk-select) + tab bar + the
          shared quick-add flow. onLogged refreshes the timeline in place. */}
      <ForageBottomBar
        active="foodlog"
        showSearch={!bulkActions}
        date={date}
        onLogged={(created) => {
          // Hand the new rows to the timeline for an optimistic paint, then bump
          // reload so its silent refresh reconciles against the server.
          if (created?.length) setPendingInsert(created);
          setReload((n) => n + 1);
        }}
      />
    </div>
  );
}
