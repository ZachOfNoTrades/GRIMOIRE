"use client";

import { useCallback, useRef, useState } from "react";

export interface HistoryEntry<T> {
  label: string; // what the step did, e.g. "Draw building"
  state: T;
}

interface History<T> {
  entries: HistoryEntry<T>[];
  index: number; // the step on screen; entries after it are undone steps that can be redone
}

// One run of changes merges into a single step while it keeps the same label and target and arrives
// within this window: a drag, or a run of typing, is one step rather than one per pointer move or key.
const MERGE_MS = 700;

// EDIT HISTORY — every change is a named step. Undo and redo move one step; `jumpTo` moves any number
// at once. Undone steps stay listed (and can be jumped back to) until a new change replaces them.
export function useEditHistory<T>(apply: (state: T) => void) {
  const [history, setHistory] = useState<History<T> | null>(null);
  const lastRef = useRef<{ key: string; at: number } | null>(null);

  // Starts a fresh history at `state` (entering edit mode).
  const begin = useCallback((state: T, label = "Start") => {
    lastRef.current = null;
    setHistory({ entries: [{ label, state }], index: 0 });
  }, []);

  const end = useCallback(() => {
    lastRef.current = null;
    setHistory(null);
  }, []);

  // Records `state` as the result of a change called `label`. `mergeKey` names the kind of change and
  // what it changed (e.g. "move|f3"): quick changes with the same key merge into one step, taking the
  // newest label, so typing a name is one step even though its label changes with every key.
  const record = useCallback((label: string, state: T, mergeKey = "") => {
    const key = mergeKey || label;
    const now = Date.now();
    const last = lastRef.current;
    lastRef.current = { key, at: now };
    setHistory((current) => {
      if (!current) return current;
      const isMerge = !!last && last.key === key && now - last.at < MERGE_MS && current.index === current.entries.length - 1 && current.index > 0;
      if (isMerge) {
        const entries = current.entries.slice();
        entries[current.index] = { label, state };
        return { entries, index: current.index };
      }
      // A new change drops whatever had been undone after the current step.
      const entries = [...current.entries.slice(0, current.index + 1), { label, state }];
      return { entries, index: entries.length - 1 };
    });
  }, []);

  // Read from a ref so a jump applies the state outside React's state updater.
  const historyRef = useRef(history);
  historyRef.current = history;
  const jumpTo = useCallback((index: number) => {
    const current = historyRef.current;
    if (!current || index < 0 || index >= current.entries.length || index === current.index) return;
    lastRef.current = null;
    apply(current.entries[index].state);
    setHistory({ ...current, index });
  }, [apply]);

  const index = history?.index ?? 0;
  const count = history?.entries.length ?? 0;
  return {
    entries: history?.entries ?? [],
    index,
    canUndo: index > 0,
    canRedo: index < count - 1,
    undo: () => jumpTo(index - 1),
    redo: () => jumpTo(index + 1),
    jumpTo,
    begin,
    end,
    record,
  };
}
