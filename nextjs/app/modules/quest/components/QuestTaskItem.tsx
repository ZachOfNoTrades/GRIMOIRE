"use client";

import { Check, Repeat, ListTodo, Flame, Skull, Coins, Snowflake } from "lucide-react";
import { Difficulty, TaskKind } from "../types/task";

// Reusable task-row layout, matching the quest home page item: checkbox · kind icon · title (+
// streak/neglect) · reward chip. Presentational — the caller wires the toggle. The home page keeps
// its own richer row (drag handle, reward tooltip, subtask chip, damage projection); this captures
// the shared layout so other surfaces (e.g. the calendar's Today view) look identical.

// Streak-tinted reward color, mirroring the home page's streakShade.
function streakShade(streak: number): string {
  if (streak <= 0) return "text-yellow-500";
  if (streak < 5) return "text-yellow-400";
  if (streak < 10) return "text-orange-400";
  if (streak < 20) return "text-orange-300";
  return "text-amber-300";
}

export interface QuestTaskItemProps {
  title: string;
  kind: TaskKind;
  difficulty?: Difficulty;
  done: boolean;
  carriedOver?: boolean; // carried to this day from a frozen day → snowflake after the title
  streakCount?: number;
  neglectCount?: number;
  rewardValue: number;
  streakBonus?: number;
  busy?: boolean;
  onToggle?: () => void;
}

export default function QuestTaskItem({
  title,
  kind,
  done,
  carriedOver = false,
  streakCount = 0,
  neglectCount = 0,
  rewardValue,
  streakBonus = 0,
  busy = false,
  onToggle,
}: QuestTaskItemProps) {
  const isDaily = kind === "daily";
  return (
    // TASK ROW
    <div
      className={`flex items-center gap-2 px-3 py-2.5 rounded border min-h-16 ${
        done ? "border-gray-700 opacity-60" : "border-gray-600"
      }`}
    >
      {/* CHECKBOX */}
      <button
        onClick={onToggle}
        disabled={busy}
        title={done ? "Uncheck" : "Complete"}
        className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 disabled:opacity-50 ${
          done
            ? "bg-green-500/20 border-green-500/40 text-green-500 hover:bg-green-500/30 cursor-pointer"
            : "border-gray-500 hover:border-green-500 hover:bg-green-500/10 cursor-pointer"
        }`}
      >
        {done && <Check className="w-3 h-3" />}
      </button>

      {/* KIND ICON */}
      {isDaily ? (
        <Repeat className="w-4 h-4 text-blue-400 shrink-0" aria-label="Daily" />
      ) : (
        <ListTodo className="w-4 h-4 text-secondary shrink-0" aria-label="Todo" />
      )}

      {/* TITLE COLUMN — title on top, streak/neglect below */}
      <div className="flex-1 min-w-0 flex flex-col justify-between gap-1 self-stretch py-0.5">
        <span className="flex items-center gap-1 min-w-0 text-sm">
          <span className={`truncate ${done ? "line-through" : ""}`}>{title}</span>
          {carriedOver && (
            <Snowflake className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-label="Carried over from a frozen day" />
          )}
        </span>
        {/* Streak and neglect are mutually exclusive — an active streak means the task isn't being
            neglected, so a stale neglect counter (e.g. preserved across a freeze) is not shown. */}
        {isDaily && (streakCount > 0 || neglectCount > 0) && (
          <div className="flex items-center gap-3">
            {streakCount > 0 ? (
              <span className="text-xs text-orange-400 flex items-center gap-0.5 shrink-0 tabular-nums" title={`${streakCount}-day streak`}>
                <Flame className="w-3 h-3" />
                {streakCount}
              </span>
            ) : (
              <span className="text-xs text-red-400 flex items-center gap-0.5 shrink-0 tabular-nums" title={`${neglectCount}-day neglect`}>
                <Skull className="w-3 h-3" />
                {neglectCount}
              </span>
            )}
          </div>
        )}
      </div>

      {/* REWARD CHIP */}
      <div className="flex flex-col justify-between items-end shrink-0 self-stretch py-0.5">
        <span className={`text-xs tabular-nums flex flex-col items-end leading-tight ${streakShade(streakCount)}${streakCount > 0 ? " font-semibold" : ""}`}>
          <span className="flex items-center gap-1">
            <Coins className="w-3 h-3" />
            {rewardValue.toFixed(2)}
          </span>
          {streakBonus > 0 && (
            <span className="text-[10px] font-semibold leading-none text-orange-300">+{streakBonus.toFixed(2)}</span>
          )}
        </span>
      </div>
    </div>
  );
}
