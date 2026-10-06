"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Cpu, Trash2 } from "lucide-react";
import toast, { Toaster } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import HelpButton from "@/components/ui/HelpButton";
import Breadcrumbs from "@/components/Breadcrumbs";
import { SettingsControlRow } from "@/components/settings/SettingsList";
import { LLM_TASKS, LLM_TASK_GROUPS, type LlmTaskId } from "@/lib/llm/tasks";
import type { LlmBackend, LlmTaskConfig } from "@/lib/llm/types";
import type { LlmTaskPrefs } from "@/types/preferences";

// SETTINGS → AI → MODELS. Three things, all the signed-in user's own:
//   1. a 30-day usage strip (the Usage page has the breakdown),
//   2. their OpenRouter key — validated on save, shown as label + last 4 only,
//   3. per-task backend: the shared Claude CLI or OpenRouter with their key, with an
//      optional OpenRouter model id per task.
// Explicit Save (not optimistic): a key must be accepted by OpenRouter before it
// counts as saved, and the task table is one form.

interface KeyStatus {
  configured: boolean;
  last4: string | null;
  label: string | null;
  ts_updated: string | null;
}

interface UsageSummary {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  byBackend: Record<LlmBackend, { calls: number; costUsd: number }>;
}

type TaskRows = Record<LlmTaskId, LlmTaskConfig>;

const BACKEND_LABEL: Record<LlmBackend, string> = { claude: "Claude", openrouter: "OpenRouter" };

function rowsFrom(prefs: LlmTaskPrefs): TaskRows {
  const rows = {} as TaskRows;
  for (const task of LLM_TASKS) {
    rows[task.id] = prefs[task.id] ?? { backend: task.openRouterOnly ? "openrouter" : "claude" };
  }
  return rows;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function LlmSettingsPage() {
  const router = useRouter();

  // DATA
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [rows, setRows] = useState<TaskRows | null>(null);

  // INPUT
  const [keyInput, setKeyInput] = useState("");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isRemovingKey, setIsRemovingKey] = useState(false);
  const [isSavingTasks, setIsSavingTasks] = useState(false);

  // LOAD — everything the page paints, before it paints.
  useEffect(() => {
    let stale = false;
    (async () => {
      try {
        const [k, u, p] = await Promise.all([
          fetch("/api/users/me/llm-key").then((r) => r.json()),
          fetch("/api/users/me/llm-usage?range=30d").then((r) => r.json()),
          fetch("/api/users/me/preferences").then((r) => r.json()),
        ]);
        if (stale) return;
        setKeyStatus(k.error ? { configured: false, last4: null, label: null, ts_updated: null } : k);
        setUsage(u.error ? null : u.summary);
        setRows(rowsFrom(p.error ? {} : (p.llm_tasks ?? {})));
      } catch {
        if (!stale) toast.error("Couldn't load AI settings");
      } finally {
        if (!stale) setIsLoading(false);
      }
    })();
    return () => { stale = true; };
  }, []);

  const needsKey = useMemo(
    () => !!rows && !keyStatus?.configured && Object.values(rows).some((r) => r.backend === "openrouter"),
    [rows, keyStatus]
  );

  async function saveKey() {
    const key = keyInput.trim();
    if (!key) return;
    setIsSavingKey(true);
    try {
      const res = await fetch("/api/users/me/llm-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error || "Couldn't save the key");
        return;
      }
      setKeyStatus(body);
      setKeyInput("");
      toast.success("OpenRouter key saved");
    } catch {
      toast.error("Couldn't save the key");
    } finally {
      setIsSavingKey(false);
    }
  }

  async function removeKey() {
    setIsRemovingKey(true);
    try {
      const res = await fetch("/api/users/me/llm-key", { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error || "Couldn't remove the key");
        return;
      }
      setKeyStatus(body);
      toast.success("OpenRouter key removed");
    } catch {
      toast.error("Couldn't remove the key");
    } finally {
      setIsRemovingKey(false);
    }
  }

  function setRow(task: LlmTaskId, patch: Partial<LlmTaskConfig>) {
    setRows((prev) => (prev ? { ...prev, [task]: { ...prev[task], ...patch } } : prev));
  }

  function setAll(backend: LlmBackend) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      for (const task of LLM_TASKS) {
        if (!task.openRouterOnly) next[task.id] = { ...next[task.id], backend };
      }
      return next;
    });
  }

  async function saveTasks() {
    if (!rows) return;
    setIsSavingTasks(true);
    try {
      const res = await fetch("/api/users/me/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llm_tasks: rows }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error || "Couldn't save task settings");
        return;
      }
      setRows(rowsFrom(body.llm_tasks ?? {}));
      toast.success("Task settings saved");
    } catch {
      toast.error("Couldn't save task settings");
    } finally {
      setIsSavingTasks(false);
    }
  }

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BREADCRUMBS */}
        <Breadcrumbs label="Models" />

        {/* PAGE TITLE + HELP */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <h1 className="text-page-title settings-title" style={{ flex: 1, minWidth: 0 }}>
            <Cpu className="w-6 h-6" /> Models
          </h1>
          <HelpButton
            title="Models"
            sections={[
              { heading: "Backends", body: "Claude is the shared Claude Code CLI. OpenRouter runs the same task on any model there, billed to your own OpenRouter account." },
              { heading: "Key", body: "Your key is checked with OpenRouter when saved, stored encrypted and bound to your account, and never shown again. Nothing runs on it except your own tasks." },
              { heading: "Tasks", body: "Each task picks its backend on its own. A task on OpenRouter with no key saved fails instead of using Claude. The model field takes an OpenRouter model id; blank uses the default shown." },
            ]}
          />
        </div>

        {/* LOADING — one page-level state; nothing data-driven paints before the data is here */}
        {isLoading && (
          <div className="loading-container">
            <div className="loading-spinner" />
          </div>
        )}

        {!isLoading && rows && (
          <>
            {/* USAGE STRIP — last 30 days */}
            <h2 className="settings-section-title">Usage · 30 days</h2>
            <div className="stat-section">
              <div className="stat-card">
                <div className="stat-label">Calls</div>
                <div className="stat-value">{usage ? compact(usage.calls) : "—"}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Tokens</div>
                <div className="stat-value">{usage ? compact(usage.promptTokens + usage.completionTokens) : "—"}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">OpenRouter</div>
                <div className="stat-value">{usage ? `$${usage.byBackend.openrouter.costUsd.toFixed(2)}` : "—"}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Claude</div>
                <div className="stat-value">{usage ? compact(usage.byBackend.claude.calls) : "—"}</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <Button className="btn-link" onClick={() => router.push("/settings/ui/usage")}>Usage</Button>
            </div>

            {/* OPENROUTER KEY */}
            <h2 className="settings-section-title">OpenRouter key</h2>
            <div className="settings-group" style={{ padding: "0.75rem 1rem" }}>

              {/* CONNECTED ROW */}
              {keyStatus?.configured && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <span className="font-mono" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {keyStatus.label ? `${keyStatus.label} · ` : ""}••••{keyStatus.last4}
                  </span>
                  <Button className="btn-red !p-2" onClick={removeKey} disabled={isRemovingKey} title="Remove">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* KEY INPUT — cleared after save, never prefilled */}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="password"
                  className="input-field"
                  style={{ flex: 1, minWidth: 0 }}
                  placeholder={keyStatus?.configured ? "Replace key" : "sk-or-v1-…"}
                  value={keyInput}
                  autoComplete="off"
                  onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveKey(); }}
                />
                <Button className="btn-blue" onClick={saveKey} disabled={isSavingKey || !keyInput.trim()}>
                  {isSavingKey ? "Checking…" : "Save"}
                </Button>
              </div>

              {/* REQUIRED NOTE — only when a task already points at OpenRouter */}
              {needsKey && (
                <p className="settings-group-note" style={{ marginTop: "0.5rem" }}>
                  Tasks set to OpenRouter fail until a key is saved.
                </p>
              )}
            </div>

            {/* TASKS */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1.5rem" }}>
              <h2 className="settings-section-title" style={{ flex: 1, margin: 0 }}>Tasks</h2>
              <Button className="btn-off" onClick={() => setAll("claude")}>All Claude</Button>
              <Button className="btn-off" onClick={() => setAll("openrouter")}>All OpenRouter</Button>
            </div>

            {/* TASK GROUPS — one settings card per module; each row = task label +
                backend select + model id. The control row stacks under the label on
                phones (see .settings-control-row), so nothing scrolls sideways. */}
            {LLM_TASK_GROUPS.map((group) => (
              <div key={group.key}>
                <h3 className="settings-section-title" style={{ fontSize: "0.9rem" }}>{group.label}</h3>
                <div className="settings-group">
                  {LLM_TASKS.filter((t) => t.group === group.key).map((task, i) => {
                    const row = rows[task.id];
                    return (
                      <SettingsControlRow key={task.id} label={task.label} divider={i > 0}>
                        <span style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", width: "100%", minWidth: 0 }}>
                          <select
                            className="input-field input-field-compact"
                            style={{ flex: "0 0 auto", minWidth: "9rem" }}
                            value={row.backend}
                            disabled={task.openRouterOnly}
                            aria-label={`${task.label} backend`}
                            onChange={(e) => setRow(task.id, { backend: e.target.value as LlmBackend })}
                          >
                            {!task.openRouterOnly && <option value="claude">{BACKEND_LABEL.claude}</option>}
                            <option value="openrouter">{BACKEND_LABEL.openrouter}</option>
                          </select>
                          <input
                            type="text"
                            className="input-field input-field-compact font-mono"
                            style={{ flex: "1 1 8rem", minWidth: 0 }}
                            placeholder={task.openRouterModel}
                            value={row.model ?? ""}
                            disabled={row.backend !== "openrouter"}
                            aria-label={`${task.label} model`}
                            onChange={(e) => setRow(task.id, { model: e.target.value })}
                          />
                        </span>
                      </SettingsControlRow>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* SAVE TASKS */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <Button className="btn-blue" onClick={saveTasks} disabled={isSavingTasks}>
                {isSavingTasks ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        )}

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>
    </div>
  );
}
