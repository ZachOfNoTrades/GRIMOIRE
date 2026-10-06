"use client";

import { Redo2, Undo2 } from "lucide-react";
import type { HistoryEntry } from "../lib/useEditHistory";

interface HistoryPanelProps<T> {
  entries: HistoryEntry<T>[];
  index: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onJump: (index: number) => void;
}

// HISTORY — every edit as a step, oldest first. Clicking a step goes straight to it, however many
// steps away. Steps after the current one were undone: they show dimmed and can still be clicked
// to redo them, until a new edit replaces them.
export default function HistoryPanel<T>({ entries, index, canUndo, canRedo, onUndo, onRedo, onJump }: HistoryPanelProps<T>) {
  return (
    <div className="card orc-history">
      <div className="card-header">
        <h2 className="text-card-title">History</h2>
        <div className="orc-row-actions">
          <button type="button" className="orc-zoom-btn" disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo" onClick={onUndo}><Undo2 className="w-4 h-4" /></button>
          <button type="button" className="orc-zoom-btn" disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" onClick={onRedo}><Redo2 className="w-4 h-4" /></button>
        </div>
      </div>
      <ol className="card-content orc-history-list" aria-label="Edit steps">
        {entries.map((entry, step) => (
          <li key={step}>
            <button
              type="button"
              className="orc-history-step"
              data-current={step === index ? "true" : undefined}
              data-undone={step > index ? "true" : undefined}
              aria-current={step === index ? "step" : undefined}
              onClick={() => onJump(step)}
            >
              {entry.label}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
