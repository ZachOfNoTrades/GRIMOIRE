"use client";

import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Modal from "@/components/Modal";
import {
  Coins,
  Plus,
  Check,
  Trash2,
  X,
  Repeat,
  ListTodo,
  GripVertical,
  Sparkles,
  Bell,
  ChevronDown,
  CalendarClock,
} from "lucide-react";
import {
  Difficulty,
  DIFFICULTY_ORDER,
  Frequency,
  FREQUENCIES,
  RepeatMode,
  repeatModeApplies,
  WEEKDAY_LETTERS,
  WEEKDAY_KEYS,
} from "../types/task";
import {
  TaskFormState,
  DIFF_LABELS,
  DIFF_SPARKS,
  FREQ_LABELS,
  localTodayYMD,
  normalizeCoinInput,
} from "../types/taskForm";

// The task create/edit modal, shared by the quest home page and the calendar page so both open the
// SAME editor. It is presentational: it owns the draft-manipulation the form needs (day-of-week
// toggles, the checklist draft and its drag-reorder) and nothing else — the page that renders it
// owns the form state and what "save" and "delete" mean, which differ (the home page updates its
// task list optimistically; the calendar page refetches).

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINAL_WORDS = ["first", "second", "third", "fourth", "fifth"];

// "3rd", "21st" — for the day-of-month label.
function ordinalNumber(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${n % 10 <= 3 ? suffix : "th"}`;
}

// Plain-English labels for the two calendar anchors, derived from the chosen start date so the
// options read as the actual schedule ("Repeats on the first Monday of every month") rather than
// abstract modes. Null start date = nothing to anchor to yet.
function repeatModeLabels(frequency: Frequency, startYMD: string): { day_of_month: string; nth_weekday: string } | null {
  if (!startYMD) return null;
  const d = new Date(`${startYMD}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const nth = ORDINAL_WORDS[Math.ceil(d.getDate() / 7) - 1] ?? "last";
  const weekday = WEEKDAY_NAMES[d.getDay()];
  if (frequency === "yearly") {
    const month = MONTH_NAMES[d.getMonth()];
    return {
      day_of_month: `On ${month} ${d.getDate()} every year`,
      nth_weekday: `On the ${nth} ${weekday} of ${month} every year`,
    };
  }
  return {
    day_of_month: `On the ${ordinalNumber(d.getDate())} of every month`,
    nth_weekday: `On the ${nth} ${weekday} of every month`,
  };
}

export default function QuestTaskModal({
  form,
  setForm,
  editingTaskId,
  advancedOpen,
  setAdvancedOpen,
  submitting,
  onClose,
  onSubmit,
  onDelete,
  computedReward,
}: {
  form: TaskFormState;
  setForm: Dispatch<SetStateAction<TaskFormState | null>> & ((f: TaskFormState) => void);
  editingTaskId: string | null;
  advancedOpen: boolean;
  setAdvancedOpen: Dispatch<SetStateAction<boolean>>;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onDelete: (id: string) => void;
  // Base coin reward for a difficulty — the page supplies it because it depends on the user's
  // settings (difficulty factors, advanced-mode formulas, balance).
  computedReward: (d: Difficulty, kind?: "daily" | "todo" | "habit", age?: number) => number;
}) {
  function toggleDayOfWeek(key: string) {
    if (!form) return;
    setForm({
      ...form,
      days_of_week: form.days_of_week.includes(key)
        ? form.days_of_week.filter((d) => d !== key)
        : [...form.days_of_week, key],
    });
  }

  function addPendingSubtask() {
    if (!form) return;
    const v = form.newSubtaskInput.trim();
    if (!v) return;
    const tempId = `tmp-${Date.now()}-${Math.random()}`;
    setForm({
      ...form,
      subtasksDraft: [...form.subtasksDraft, { id: tempId, title: v, done: false, isNew: true }],
      newSubtaskInput: "",
    });
  }

  function toggleDraftSubtask(id: string) {
    if (!form) return;
    setForm({
      ...form,
      subtasksDraft: form.subtasksDraft.map((s) => (s.id === id ? { ...s, done: !s.done } : s)),
    });
  }

  function removeDraftSubtask(id: string) {
    if (!form) return;
    setForm({
      ...form,
      subtasksDraft: form.subtasksDraft.filter((s) => s.id !== id),
    });
  }

  // CHECKLIST DRAG-REORDER — pointer-events based (like the task-list reorder) so it works on touch
  // (mobile Firefox) as well as mouse. We live-reorder the draft array as the pointer crosses other
  // rows; the resulting order is persisted on save via the subtasks/reorder API.
  const [subtaskDragId, setSubtaskDragId] = useState<string | null>(null);
  const subtaskDragIdRef = useRef<string | null>(null);
  const subtaskRowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  // Move the dragged checklist item so it lands at the position currently occupied by targetId.
  function moveDraftSubtaskOver(dragId: string, targetId: string) {
    if (dragId === targetId) return;
    setForm((prev) => {
      if (!prev) return prev;
      const list = prev.subtasksDraft;
      const from = list.findIndex((s) => s.id === dragId);
      const to = list.findIndex((s) => s.id === targetId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...prev, subtasksDraft: next };
    });
  }

  function onSubtaskHandlePointerDown(e: React.PointerEvent, id: string) {
    e.preventDefault();
    subtaskDragIdRef.current = id;
    setSubtaskDragId(id);
    const onMove = (ev: PointerEvent) => {
      const dragId = subtaskDragIdRef.current;
      if (!dragId) return;
      // Find the checklist row whose vertical span the pointer is currently over and reorder onto it.
      for (const [rowId, el] of subtaskRowRefs.current) {
        const r = el.getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) {
          if (rowId !== dragId) moveDraftSubtaskOver(dragId, rowId);
          break;
        }
      }
    };
    const finish = () => {
      subtaskDragIdRef.current = null;
      setSubtaskDragId(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }
  return (
    // The app's shared Modal: portalled, background-scroll-locked, and sized from the REAL visible
    // viewport (Firefox Android's toolbar makes raw vh overshoot) — see components/Modal.tsx. `tall`
    // raises its cap to 95% because this form is long; its body is the scroll region.
    <Modal
      isOpen
      onClose={onClose}
      tall
      title={`${editingTaskId ? "Edit" : "Create"} ${form.kind === "daily" ? "Daily" : "Todo"}`}
      modalActions={
        <div className="flex items-center gap-2">

          {/* DELETE (editing only) */}
          {editingTaskId && (
            <button
              onClick={() => {
                const id = editingTaskId;
                onClose();
                void onDelete(id);
              }}
              title="Delete task"
              className="h-8 px-2 rounded border border-red-500/40 text-red-500 hover:bg-red-500/10 cursor-pointer inline-flex items-center gap-1 text-sm"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* SAVE / CREATE */}
          <button
            onClick={onSubmit}
            disabled={!form.title.trim() || submitting}
            className="h-8 px-3 rounded border border-transparent bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer inline-flex items-center"
          >
            {submitting ? "Saving..." : editingTaskId ? "Save" : "Create"}
          </button>

          {/* CLOSE */}
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-700 cursor-pointer" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      }
    >
      {/* FORM — Modal's own .modal-body scrolls it. */}
      <div className="space-y-5">

            {/* KIND TOGGLE — creating only. Two cards rather than a bare segmented control: the
                choice changes which fields exist below, so each option says what it means. A todo
                keeps the Start Date (its scheduled day) but drops the cadence fields; switching
                kind mid-form keeps everything else typed. */}
            {!editingTaskId && (
              <div className="grid grid-cols-2 gap-2">
                {([
                  { kind: "daily", label: "Daily", hint: "Repeats on a schedule", Icon: Repeat },
                  { kind: "todo", label: "Todo", hint: "One-off, on a set day", Icon: ListTodo },
                ] as const).map(({ kind, label, hint, Icon }) => {
                  const active = form.kind === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setForm({ ...form, kind })}
                      className={`relative flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left cursor-pointer transition-colors ${
                        active
                          ? "border-blue-500 bg-blue-500/15"
                          : "border-gray-700 hover:border-gray-500 hover:bg-gray-800/60"
                      }`}
                    >

                      {/* LABEL */}
                      <span className={`flex items-center gap-1.5 text-sm font-semibold ${active ? "text-blue-400" : "text-gray-300"}`}>
                        <Icon className="w-4 h-4" />
                        {label}
                      </span>

                      {/* HINT */}
                      <span className="text-[11px] leading-tight text-gray-400">{hint}</span>

                      {/* SELECTED TICK */}
                      {active && <Check className="w-3.5 h-3.5 text-blue-400 absolute top-2 right-2" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* TITLE */}
            <label className="block">
              <span className="text-sm text-secondary">Task Title</span>
              <input
                type="text"
                autoFocus={!editingTaskId}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded border border-gray-600 bg-transparent"
              />
            </label>

            {/* DESCRIPTION — optional free-text notes/details, shown as a sub-line on the task row */}
            <label className="block">
              <span className="text-sm text-secondary">Description <span className="text-xs text-gray-500">(optional)</span></span>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Add notes or details…"
                className="mt-1 w-full px-3 py-2 rounded border border-gray-600 bg-transparent resize-y"
              />
            </label>

            {/* DIFFICULTY */}
            <div>
              <span className="text-sm text-secondary block mb-2">Difficulty</span>
              <div className="grid grid-cols-4 gap-2">
                {DIFFICULTY_ORDER.map((d) => {
                  const selected = form.difficulty === d;
                  return (
                    <button
                      key={d}
                      onClick={() => setForm({ ...form, difficulty: d })}
                      className={`flex flex-col items-center gap-1 py-3 rounded border cursor-pointer ${
                        selected
                          ? "bg-blue-600/30 border-blue-500 text-primary"
                          : "border-gray-600 text-secondary hover:bg-gray-800"
                      }`}
                    >
                      <span className="flex gap-0.5">
                        {Array.from({ length: DIFF_SPARKS[d] }).map((_, i) => (
                          <Sparkles key={i} className="w-3 h-3" />
                        ))}
                      </span>
                      <span className="text-xs font-semibold">{DIFF_LABELS[d]}</span>
                      <span className="text-xs text-yellow-500 flex items-center gap-0.5 tabular-nums">
                        <Coins className="w-3 h-3" />
                        {computedReward(d, form.kind).toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-secondary mt-1">
                Reward per difficulty is configured in Settings → Difficulty.
              </p>
            </div>

            {/* CUSTOM REWARD OVERRIDE */}
            <div>
              {/* OVERRIDE TOGGLE */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.reward_override.trim() !== ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      reward_override: e.target.checked
                        ? computedReward(form.difficulty, form.kind).toFixed(2)
                        : "",
                    })
                  }
                  className="w-4 h-4 accent-blue-500 cursor-pointer"
                />
                <span className="text-sm text-secondary">Custom reward override</span>
              </label>

              {/* OVERRIDE INPUT — only when enabled */}
              {form.reward_override.trim() !== "" && (
                <div className="mt-2">
                  {/* COINS INPUT */}
                  <div className="relative">
                    <Coins className="w-4 h-4 text-yellow-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />

                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.reward_override}
                      onChange={(e) => setForm({ ...form, reward_override: e.target.value })}
                      onBlur={(e) => setForm({ ...form, reward_override: normalizeCoinInput(e.target.value) })}
                      className="mt-0 w-full pl-9 pr-3 py-2 rounded border border-gray-600 bg-transparent tabular-nums"
                    />
                  </div>

                  {/* OVERRIDE HELP TEXT */}
                  <p className="text-xs text-secondary mt-1">
                    Replaces the difficulty-based reward for this task. Streak / age bonuses still
                    build on this value.
                  </p>
                </div>
              )}
            </div>

            {/* SCHEDULING */}
            <div className="space-y-3">
              <span className="text-sm text-secondary block">Scheduling</span>

              <label className="block">
                <span className="text-xs text-secondary">
                  {form.kind === "daily" ? "Start Date" : "Scheduled Date"}
                </span>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded border border-gray-600 bg-transparent"
                />
              </label>

              {form.kind === "daily" && (
                <>
                  {/* REPEATS + EVERY-N */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* REPEATS SELECT */}
                    <label className="block">
                      <span className="text-xs text-secondary">Repeats</span>
                      <select
                        value={form.frequency}
                        onChange={(e) =>
                          setForm({ ...form, frequency: e.target.value as Frequency })
                        }
                        className="mt-1 w-full px-3 py-2 rounded border border-gray-600 bg-transparent"
                      >
                        {FREQUENCIES.map((f) => (
                          <option key={f} value={f}>
                            {FREQ_LABELS[f]}
                          </option>
                        ))}
                      </select>
                    </label>

                    {/* EVERY-N INPUT */}
                    <label className="block">
                      <span className="text-xs text-secondary">Every (N)</span>
                      <input
                        type="number"
                        min={1}
                        value={form.every_n}
                        onChange={(e) => setForm({ ...form, every_n: e.target.value })}
                        className="mt-1 w-full px-3 py-2 rounded border border-gray-600 bg-transparent"
                      />
                    </label>
                  </div>

                  {/* REPEAT MODE — monthly / yearly only. Both options are derived from the start
                      date, so they read as the real schedule instead of abstract modes. */}
                  {repeatModeApplies(form.frequency) && (() => {
                    const labels = repeatModeLabels(form.frequency, form.start_date);
                    if (!labels) {
                      return (
                        <p className="text-xs text-secondary">
                          Pick a start date to choose how this repeats.
                        </p>
                      );
                    }
                    return (
                      <div className="flex flex-col gap-1.5">
                        {(["day_of_month", "nth_weekday"] as const).map((mode) => {
                          const active = form.repeat_mode === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setForm({ ...form, repeat_mode: mode })}
                              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs cursor-pointer transition-colors ${
                                active
                                  ? "border-blue-500 bg-blue-500/15 text-blue-400"
                                  : "border-gray-700 text-gray-300 hover:border-gray-500 hover:bg-gray-800/60"
                              }`}
                            >
                              <span className={`w-3 h-3 rounded-full border shrink-0 ${active ? "border-blue-400 bg-blue-500" : "border-gray-500"}`} />
                              {labels[mode]}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* DAYS OF WEEK (each selected day is independently required) */}
                  {form.frequency === "daily" && (
                    <div>
                      <span className="text-xs text-secondary block mb-1">Days of Week</span>
                      <div className="flex justify-between gap-1">
                        {WEEKDAY_KEYS.map((key, i) => {
                          const active = form.days_of_week.includes(key);
                          return (
                            <button
                              key={key}
                              onClick={() => toggleDayOfWeek(key)}
                              className={`w-8 h-8 rounded-full text-xs font-semibold cursor-pointer ${
                                active
                                  ? "bg-blue-600 text-white"
                                  : "border border-gray-600 text-secondary hover:bg-gray-800"
                              }`}
                            >
                              {WEEKDAY_LETTERS[i]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ADVANCED (collapsible) */}
                  <div className="border-t border-gray-700 pt-2">
                    {/* ADVANCED TOGGLE */}
                    <button
                      type="button"
                      onClick={() => setAdvancedOpen((v) => !v)}
                      className="flex items-center gap-1 text-xs text-secondary hover:text-primary cursor-pointer"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${advancedOpen ? "" : "-rotate-90"}`}
                      />
                      Advanced
                    </button>

                    {/* ADVANCED CONTENT */}
                    {advancedOpen && (
                      <div className="mt-3">
                        {/* COMPLETION GRACE WINDOW (complete once anywhere within N days of each occurrence) */}
                        <label className="block">
                          <span className="text-xs text-secondary">Complete within (days)</span>
                          <input
                            type="number"
                            min={1}
                            value={form.window_days}
                            onChange={(e) => setForm({ ...form, window_days: e.target.value })}
                            className="mt-1 w-full px-3 py-2 rounded border border-gray-600 bg-transparent"
                          />
                        </label>

                        {/* GRACE WINDOW HELP TEXT */}
                        <p className="text-xs text-secondary mt-1">
                          {Number(form.window_days) > 1
                            ? `Each scheduled occurrence stays completable for ${Number(form.window_days)} days; doing it on any one of those days counts for the whole window. (e.g. a weekend chore = Weekly, start on a Saturday, 2 days.)`
                            : "Must be completed on the scheduled day. Increase to allow finishing within a range of days (e.g. a weekend chore = Weekly, start on a Saturday, 2 days)."}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* CHECKLIST */}
            <div>
              <span className="text-sm text-secondary block mb-2">Checklist</span>
              {form.subtasksDraft.length > 0 && (
                <ul className="space-y-1 mb-2">
                  {form.subtasksDraft.map((s) => (
                    <li
                      key={s.id}
                      ref={(el) => {
                        if (el) subtaskRowRefs.current.set(s.id, el);
                        else subtaskRowRefs.current.delete(s.id);
                      }}
                      className={`flex items-center gap-2 px-2 py-1 rounded border ${
                        subtaskDragId === s.id ? "border-blue-400 ring-2 ring-blue-400 bg-gray-800/60" : "border-gray-700"
                      }`}
                    >
                      {/* DRAG HANDLE */}
                      <span
                        className="text-gray-500 cursor-grab active:cursor-grabbing shrink-0 select-none flex items-center justify-center min-w-9 min-h-9 -ml-1 sm:min-w-0 sm:min-h-0 sm:ml-0"
                        style={{ touchAction: "none" }}
                        title="Drag to reorder"
                        onPointerDown={(e) => onSubtaskHandlePointerDown(e, s.id)}
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <button
                        onClick={() => toggleDraftSubtask(s.id)}
                        className={`w-4 h-4 rounded-sm border flex items-center justify-center cursor-pointer ${
                          s.done ? "bg-green-500/30 border-green-500/50 text-green-500" : "border-gray-500"
                        }`}
                      >
                        {s.done && <Check className="w-3 h-3" />}
                      </button>
                      <span className={`flex-1 text-sm ${s.done ? "line-through text-secondary" : ""}`}>
                        {s.title}
                      </span>
                      <button
                        onClick={() => removeDraftSubtask(s.id)}
                        className="p-1 rounded hover:bg-red-500/20 text-red-500 cursor-pointer"
                        title="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="New checklist entry"
                  value={form.newSubtaskInput}
                  onChange={(e) => setForm({ ...form, newSubtaskInput: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addPendingSubtask();
                    }
                  }}
                  className="flex-1 px-3 py-2 rounded border border-gray-600 bg-transparent text-sm"
                />
                <button
                  onClick={addPendingSubtask}
                  className="px-3 py-2 rounded border border-gray-600 hover:bg-gray-800 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* REMINDERS */}
            <div>
              <span className="text-sm text-secondary block mb-2 flex items-center gap-1">
                <Bell className="w-4 h-4" /> Reminders
              </span>
              {form.reminders.length > 0 && (
                <ul className="space-y-1 mb-2">
                  {form.reminders.map((r, idx) => (
                    <li
                      key={idx}
                      className="flex items-center gap-2 px-2 py-1 rounded border border-gray-700"
                    >
                      {form.kind === "todo" ? (
                        <input
                          type="datetime-local"
                          value={`${r.fire_date ?? localTodayYMD()}T${r.fire_time}`}
                          onChange={(e) => {
                            // datetime-local value is "YYYY-MM-DDTHH:MM". Split on 'T' to keep
                            // the API contract (separate fire_date + fire_time columns) intact.
                            const v = e.target.value;
                            const [d, t] = v.split("T");
                            if (!d || !t) return;
                            const next = [...form.reminders];
                            next[idx] = { fire_date: d, fire_time: t.slice(0, 5) };
                            setForm({ ...form, reminders: next });
                          }}
                          className="px-2 py-1 rounded bg-transparent text-sm"
                        />
                      ) : (
                        <input
                          type="time"
                          value={r.fire_time}
                          onChange={(e) => {
                            const next = [...form.reminders];
                            next[idx] = { ...next[idx], fire_time: e.target.value };
                            setForm({ ...form, reminders: next });
                          }}
                          className="px-2 py-1 rounded bg-transparent text-sm"
                        />
                      )}
                      <span className="flex-1" />
                      <button
                        onClick={() =>
                          setForm({
                            ...form,
                            reminders: form.reminders.filter((_, i) => i !== idx),
                          })
                        }
                        className="p-1 rounded hover:bg-red-500/20 text-red-500 cursor-pointer"
                        title="Remove reminder"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                onClick={() => {
                  const now = new Date();
                  const hh = String(now.getHours()).padStart(2, "0");
                  const mm = String(now.getMinutes()).padStart(2, "0");
                  setForm({
                    ...form,
                    reminders: [
                      ...form.reminders,
                      {
                        fire_time: `${hh}:${mm}`,
                        // Todos default to today so the picker shows a concrete date the user can
                        // adjust; dailies are inherently recurring so fire_date stays null.
                        fire_date: form.kind === "todo" ? localTodayYMD() : null,
                      },
                    ],
                  });
                }}
                className="px-3 py-2 rounded border border-gray-600 hover:bg-gray-800 cursor-pointer text-sm inline-flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add reminder
              </button>
            </div>

      </div>
    </Modal>
  );
}
