"use client";

import { Check } from "lucide-react";
import { CalendarView } from "../lib/calendarPrefs";

// The quest calendar's ⋮ menu contents, shared by the home card and the calendar page so the two
// are literally the same menu. Every choice is one kind of row — a label plus its state in a fixed
// leading column — which is what makes it read as a menu rather than a box of assorted controls.
// Single-choice groups use radios; the independent toggle keeps a check. Nothing here dismisses the
// menu: these are settings you may want to change two of in a row.

export const WEEK_START_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 0, label: "Sunday" },
];

export default function QuestCalendarMenu({
  view,
  onViewChange,
  weekStart,
  onWeekStartChange,
  hideDailyTasks,
  onHideDailyTasksChange,
}: {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  weekStart: number;
  onWeekStartChange: (weekStart: number) => void;
  hideDailyTasks: boolean;
  onHideDailyTasksChange: (hide: boolean) => void;
}) {
  return (
    <>

      {/* VIEW */}
      <div className="popover-caption">View</div>
      {(["month", "week"] as const).map((v) => (
        <button
          key={v}
          className="popover-item"
          role="menuitemradio"
          aria-checked={view === v}
          onClick={() => onViewChange(v)}
        >
          <span className="popover-item-radio" />
          {v === "month" ? "Month" : "Week"}
        </button>
      ))}

      {/* WEEK STARTS — applies to both views: it sets which weekday a row begins on, so the month
          grid's columns shift with it too. */}
      <div className="popover-separator" />
      <div className="popover-caption">Week starts</div>
      {WEEK_START_OPTIONS.map((o) => (
        <button
          key={o.value}
          className="popover-item"
          role="menuitemradio"
          aria-checked={weekStart === o.value}
          onClick={() => onWeekStartChange(o.value)}
        >
          <span className="popover-item-radio" />
          {o.label}
        </button>
      ))}

      <div className="popover-separator" />

      {/* DISPLAY */}
      <div className="popover-caption">Display</div>
      <button
        className="popover-item"
        role="menuitemcheckbox"
        aria-checked={hideDailyTasks}
        onClick={() => onHideDailyTasksChange(!hideDailyTasks)}
      >
        <span className="popover-item-check">{hideDailyTasks && <Check className="w-3.5 h-3.5" />}</span>
        Hide daily tasks
      </button>
    </>
  );
}
