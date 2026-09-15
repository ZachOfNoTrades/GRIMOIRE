"use client";

import { useEffect, useState } from "react";
import { BackLink } from "@/components/BackLink";
import { ArrowLeft, Flame } from "lucide-react";
import toast, { Toaster } from "@/components/Toaster";
import { Frequency } from "../../types/task";

interface StreakTaskSummary {
  id: string;
  title: string;
  kind: "daily" | "todo";
  frequency: Frequency;
  streak_count: number;
  streak_last_date: string | null;
}

interface StreakDraft {
  count: string;
  lastDate: string;
}

export default function QuestDebugPage() {

  // DATA
  const [streakTasks, setStreakTasks] = useState<StreakTaskSummary[]>([]);

  // INPUT
  const [streakDrafts, setStreakDrafts] = useState<Record<string, StreakDraft>>({});

  // STATE
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const tRes = await fetch("/modules/quest/api/tasks");
        if (tRes.ok) {
          const tasks = await tRes.json();
          const dailies: StreakTaskSummary[] = tasks
            .filter((t: { kind: string }) => t.kind === "daily")
            .map((t: StreakTaskSummary) => ({
              id: t.id,
              title: t.title,
              kind: t.kind,
              frequency: t.frequency,
              streak_count: t.streak_count ?? 0,
              streak_last_date: t.streak_last_date ?? null,
            }));
          setStreakTasks(dailies);
          const drafts: Record<string, StreakDraft> = {};
          for (const t of dailies) {
            drafts[t.id] = { count: String(t.streak_count), lastDate: t.streak_last_date ?? "" };
          }
          setStreakDrafts(drafts);
        } else {
          setError("Failed to load tasks");
        }
      } catch (e) {
        console.error(e);
        setError("Failed to load tasks");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setError(null);
    const dirty: { id: string; count: number; lastDate: string | null }[] = [];
    for (const t of streakTasks) {
      const d = streakDrafts[t.id];
      if (!d) continue;
      const curCount = String(t.streak_count);
      const curLast = t.streak_last_date ?? "";
      if (d.count === curCount && d.lastDate === curLast) continue;
      const n = Number(d.count);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        setError(`Streak count for "${t.title}" must be a non-negative integer`);
        return;
      }
      dirty.push({ id: t.id, count: n, lastDate: d.lastDate || null });
    }
    if (dirty.length === 0) {
      toast("No changes");
      return;
    }
    setSaving(true);
    try {
      await Promise.all(
        dirty.map((s) =>
          fetch(`/modules/quest/api/tasks/${s.id}/streak`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ streak_count: s.count, streak_last_date: s.lastDate }),
          })
        )
      );
      // Reflect saved values locally
      setStreakTasks((prev) =>
        prev.map((t) => {
          const d = dirty.find((x) => x.id === t.id);
          return d ? { ...t, streak_count: d.count, streak_last_date: d.lastDate } : t;
        })
      );
      toast.success(`Saved ${dirty.length} streak override(s)`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to save streak overrides");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-secondary">Loading debug tools…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Toaster position="top-right" />

      {/* HEADER */}
      <div className="mb-6 flex items-center justify-between gap-2">
        <BackLink
          fallback="/modules/quest/ui/settings"
          className="flex items-center gap-1 text-secondary hover:text-primary cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Settings</span>
        </BackLink>
        <h1 className="text-page-title flex items-center gap-2">
          <Flame className="w-6 h-6 text-orange-400" />
          Streak Debug
        </h1>
      </div>

      {error && (
        <div className="alert-error mb-4">{error}</div>
      )}

      {/* STREAK DEBUG CARD */}
      <section className="card mb-6">
        <h2 className="text-card-title mb-2">
          <Flame className="w-5 h-5 text-orange-400" />
          Streak Overrides
        </h2>
        <p className="text-secondary text-sm mb-4">
          Manually override streak count and last-date per recurring task. Set last-date empty to clear.
        </p>
        {streakTasks.length === 0 ? (
          <p className="text-secondary text-sm">No recurring tasks.</p>
        ) : (
          <ul className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
            {streakTasks.map((t) => {
              const draft = streakDrafts[t.id] ?? { count: String(t.streak_count), lastDate: t.streak_last_date ?? "" };
              return (
                <StreakRow
                  key={t.id}
                  task={t}
                  draft={draft}
                  onChange={(d) => setStreakDrafts((prev) => ({ ...prev, [t.id]: d }))}
                />
              );
            })}
          </ul>
        )}
        <div className="mt-4 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="btn btn-blue disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save Streak Overrides"}
          </button>
        </div>
      </section>
    </main>
  );
}

function StreakRow({
  task,
  draft,
  onChange,
}: {
  task: StreakTaskSummary;
  draft: StreakDraft;
  onChange: (next: StreakDraft) => void;
}) {
  const dirty = String(task.streak_count) !== draft.count || (task.streak_last_date ?? "") !== draft.lastDate;
  return (
    <li className={`flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded border ${dirty ? "border-blue-500/40 bg-blue-500/5" : "border-gray-700"}`}>
      <span className="flex-1 truncate text-sm">{task.title}</span>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number"
          onFocus={(e) => e.currentTarget.select()}
          min={0}
          step={1}
          value={draft.count}
          onChange={(e) => onChange({ ...draft, count: e.target.value })}
          className="w-16 sm:w-20 px-2 py-1 rounded border border-gray-600 bg-transparent tabular-nums text-right text-sm"
          title="Streak count"
        />
        <input
          type="date"
          value={draft.lastDate}
          onChange={(e) => onChange({ ...draft, lastDate: e.target.value })}
          className="flex-1 sm:flex-none px-2 py-1 rounded border border-gray-600 bg-transparent tabular-nums text-sm"
          title="Last streak date"
        />
      </div>
    </li>
  );
}
