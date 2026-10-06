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

interface ModelInfo {
  promptPerM: number;
  completionPerM: number;
  ctx: number;
  created: string | null;
  imageIn: boolean;
  imageOut: boolean;
  tools: boolean;
}
interface CatalogModel {
  id: string;
  name: string;
  recommended: boolean;
  estCostUsd: number | null;
  estSeconds: number | null;
  basis: { taskCalls: number; modelCalls: number };
  info: ModelInfo | null;
}
interface TaskModelList {
  recommended: string;
  models: CatalogModel[];
}
// Per backend, per task: the dropdown contents. Loaded once per backend.
type Catalog = Partial<Record<LlmBackend, Record<string, TaskModelList>>>;

// Outcome of checking a typed-in model id, per task.
type ManualCheck = { state: "checking" } | { state: "ok"; name: string; model: CatalogModel } | { state: "bad"; reason: string };

const BACKEND_LABEL: Record<LlmBackend, string> = { claude: "Claude", openrouter: "OpenRouter" };
const MANUAL = "__manual__";

function money(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  if (n >= 0.0001) return `$${n.toFixed(4)}`;
  return "<$0.0001";
}

function perM(n: number): string {
  return n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function ctxLabel(ctx: number): string {
  return ctx >= 1_000_000 ? `${(ctx / 1_000_000).toFixed(1)}M` : `${Math.round(ctx / 1000)}K`;
}

// `{Model} | ~$cost | {seconds}s` — the estimate for THIS task on that model.
function optionLabel(m: CatalogModel | undefined): string {
  if (!m) return "";
  const cost = m.estCostUsd === null ? "—" : `~${money(m.estCostUsd)}`;
  const secs = m.estSeconds === null ? "—" : `${m.estSeconds < 10 ? m.estSeconds.toFixed(1) : Math.round(m.estSeconds)}s`;
  return `${m.name} | ${cost} | ${secs}`;
}

// The footer under a dropdown: the catalog's facts, nothing else.
function modelFooter(m: CatalogModel | undefined): string {
  if (!m?.info) return "";
  const parts: string[] = [m.id, `${perM(m.info.promptPerM)} in / ${perM(m.info.completionPerM)} out per M`];
  if (m.info.ctx) parts.push(`${ctxLabel(m.info.ctx)} ctx`);
  const caps = [m.info.imageIn && "reads images", m.info.tools && "tools", m.info.imageOut && "generates images"].filter(Boolean) as string[];
  if (caps.length) parts.push(caps.join(", "));
  if (m.info.created) parts.push(m.info.created.slice(0, 7));
  return parts.join(" · ");
}

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
  const [catalog, setCatalog] = useState<Catalog>({});

  // INPUT
  const [keyInput, setKeyInput] = useState("");
  // Tasks whose model is typed in rather than picked, and the check result for each.
  const [manual, setManual] = useState<Partial<Record<LlmTaskId, boolean>>>({});
  const [checks, setChecks] = useState<Partial<Record<LlmTaskId, ManualCheck>>>({});

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
        const [k, u, p, mc, mo] = await Promise.all([
          fetch("/api/users/me/llm-key").then((r) => r.json()),
          fetch("/api/users/me/llm-usage?range=30d").then((r) => r.json()),
          fetch("/api/users/me/preferences").then((r) => r.json()),
          fetch("/api/llm/models?backend=claude").then((r) => r.json()),
          fetch("/api/llm/models?backend=openrouter").then((r) => r.json()),
        ]);
        if (stale) return;
        setKeyStatus(k.error ? { configured: false, last4: null, label: null, ts_updated: null } : k);
        setUsage(u.error ? null : u.summary);
        const nextRows = rowsFrom(p.error ? {} : (p.llm_tasks ?? {}));
        setRows(nextRows);
        const nextCatalog: Catalog = { claude: mc.error ? {} : mc, openrouter: mo.error ? {} : mo };
        setCatalog(nextCatalog);
        if (mo.error) toast.error("Couldn't load OpenRouter's model list");
        // A saved model that isn't in its dropdown was typed in — show it that way.
        const nextManual: Partial<Record<LlmTaskId, boolean>> = {};
        for (const task of LLM_TASKS) {
          const model = nextRows[task.id].model;
          if (model && !nextCatalog[nextRows[task.id].backend]?.[task.id]?.models.some((m) => m.id === model)) nextManual[task.id] = true;
        }
        setManual(nextManual);
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

  // Switching backend drops the model: ids are not portable between the two lists.
  function setBackend(task: LlmTaskId, backend: LlmBackend) {
    setRow(task, { backend, model: undefined });
    setManual((prev) => ({ ...prev, [task]: false }));
    setChecks((prev) => ({ ...prev, [task]: undefined }));
  }

  function setAll(backend: LlmBackend) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      for (const task of LLM_TASKS) {
        if (!task.openRouterOnly) next[task.id] = { backend };
      }
      return next;
    });
    setManual({});
    setChecks({});
  }

  // Dropdown change: "Manual entry…" reveals the text field; a listed id is taken as
  // valid (it came from the catalog); blank = the recommendation.
  function pickModel(task: LlmTaskId, value: string) {
    if (value === MANUAL) {
      setManual((prev) => ({ ...prev, [task]: true }));
      setRow(task, { model: undefined });
      setChecks((prev) => ({ ...prev, [task]: undefined }));
      return;
    }
    setManual((prev) => ({ ...prev, [task]: false }));
    setChecks((prev) => ({ ...prev, [task]: undefined }));
    setRow(task, { model: value || undefined });
  }

  // Check a typed-in id against the backend's catalog (and the task's needs).
  async function checkManual(task: LlmTaskId) {
    const row = rows?.[task];
    const model = row?.model?.trim();
    if (!row || !model) {
      setChecks((prev) => ({ ...prev, [task]: undefined }));
      return;
    }
    setChecks((prev) => ({ ...prev, [task]: { state: "checking" } }));
    try {
      const res = await fetch("/api/llm/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backend: row.backend, task, model }),
      });
      const body = await res.json();
      setChecks((prev) => ({ ...prev, [task]: body.ok ? { state: "ok", name: body.name, model: body.model } : { state: "bad", reason: body.reason || body.error || "Unknown model" } }));
    } catch {
      setChecks((prev) => ({ ...prev, [task]: { state: "bad", reason: "Couldn't check the model" } }));
    }
  }

  const hasBadManual = useMemo(
    () => !!rows && LLM_TASKS.some((t) => manual[t.id] && rows[t.id].model && checks[t.id]?.state !== "ok"),
    [rows, manual, checks]
  );

  async function saveTasks() {
    if (!rows) return;
    if (hasBadManual) {
      toast.error("Check every typed-in model first");
      return;
    }
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
              { heading: "Tasks", body: "Each task picks its backend on its own. A task on OpenRouter with no key saved fails instead of using Claude." },
              { heading: "Models", body: "The dropdown lists what fits the task — on OpenRouter, models that can read images, call tools or draw, as the task needs. The recommended one is the newest release of a proven family at the lowest price. Manual entry takes any other id; it's checked against the list before it can be saved." },
              { heading: "Estimates", body: "~$ and seconds per call for that task: this task's logged token counts × the model's price, and the logged duration on that model. Before any calls, typical sizes stand in." },
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
                    const list = catalog[row.backend]?.[task.id];
                    const isManual = !!manual[task.id];
                    const check = checks[task.id];
                    // Blank selection = the recommendation; shown as such in the dropdown.
                    const selectValue = isManual ? MANUAL : (row.model ?? "");
                    return (
                      <SettingsControlRow key={task.id} label={task.label} divider={i > 0}>
                        <span style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", width: "34rem", maxWidth: "100%" }}>

                          {/* BACKEND */}
                          <select
                            className="input-field input-field-compact"
                            style={{ flex: "0 0 100%", minWidth: 0 }}
                            value={row.backend}
                            disabled={task.openRouterOnly}
                            aria-label={`${task.label} backend`}
                            onChange={(e) => setBackend(task.id, e.target.value as LlmBackend)}
                          >
                            {!task.openRouterOnly && <option value="claude">{BACKEND_LABEL.claude}</option>}
                            <option value="openrouter">{BACKEND_LABEL.openrouter}</option>
                          </select>

                          {/* MODEL — catalog dropdown; "Manual entry…" opens the text field. The
                              blank value is the recommendation, listed once, as the default. Sized
                              by the row, not by its option text, so it keeps its width across
                              backends. */}
                          <select
                            className="input-field input-field-compact"
                            style={{ flex: "0 0 100%", minWidth: 0 }}
                            value={selectValue}
                            aria-label={`${task.label} model`}
                            onChange={(e) => pickModel(task.id, e.target.value)}
                          >
                            <option value={MANUAL}>Manual entry…</option>
                            <option value="">{list ? `${optionLabel(list.models.find((m) => m.recommended))} (Recommended)` : "(Recommended)"}</option>
                            {(list?.models ?? []).filter((m) => !m.recommended).map((m) => (
                              <option key={m.id} value={m.id}>{optionLabel(m)}</option>
                            ))}
                          </select>

                          {/* MANUAL ENTRY — checked against the catalog on blur */}
                          {isManual && (
                            <span style={{ display: "flex", gap: "0.5rem", width: "100%", minWidth: 0, alignItems: "center" }}>
                              <input
                                type="text"
                                className="input-field input-field-compact font-mono"
                                style={{ flex: "1 1 10rem", minWidth: 0 }}
                                placeholder={row.backend === "claude" ? "claude-sonnet-4-6" : "vendor/model-name"}
                                value={row.model ?? ""}
                                aria-label={`${task.label} model id`}
                                onChange={(e) => { setRow(task.id, { model: e.target.value }); setChecks((prev) => ({ ...prev, [task.id]: undefined })); }}
                                onBlur={() => checkManual(task.id)}
                                onKeyDown={(e) => { if (e.key === "Enter") checkManual(task.id); }}
                              />
                              <Button className="btn-off" onClick={() => checkManual(task.id)} disabled={!row.model?.trim() || check?.state === "checking"}>
                                {check?.state === "checking" ? "Checking…" : "Check"}
                              </Button>
                              {check?.state === "ok" && <span className="text-secondary">✓ {check.name}</span>}
                              {check?.state === "bad" && <span style={{ color: "var(--alert-red-text)" }}>✗ {check.reason}</span>}
                            </span>
                          )}

                          {/* FOOTER — the chosen model's facts and the basis of its estimate */}
                          {(() => {
                            const shown = isManual
                              ? (check?.state === "ok" ? check.model : undefined)
                              : list?.models.find((m) => (row.model ? m.id === row.model : m.recommended));
                            return shown ? (
                              <p className="settings-group-note" style={{ flex: "0 0 100%", margin: 0 }}>{modelFooter(shown)}</p>
                            ) : null;
                          })()}
                        </span>
                      </SettingsControlRow>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* SAVE TASKS */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <Button className="btn-blue" onClick={saveTasks} disabled={isSavingTasks || hasBadManual}>
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
