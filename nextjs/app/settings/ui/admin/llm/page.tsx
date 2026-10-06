"use client";

import { useEffect, useMemo, useState } from "react";
import { Cpu } from "lucide-react";
import toast, { Toaster } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import HelpButton from "@/components/ui/HelpButton";
import Breadcrumbs from "@/components/Breadcrumbs";
import { SettingsControlRow } from "@/components/settings/SettingsList";
import { LLM_TASKS, LLM_TASK_GROUPS, type LlmTaskId } from "@/lib/llm/tasks";
import type { LlmBackend } from "@/lib/llm/types";

// SETTINGS → ADMIN → RECOMMENDED MODELS. Pin the model each task recommends, per
// backend. A blank field leaves the catalog's own rule in charge (newest release of
// a proven family, cheapest) or, for Claude, the task's default alias. Explicit Save,
// disabled until something changed; every pinned id is checked on save.

type Pins = Partial<Record<LlmTaskId, Partial<Record<LlmBackend, string>>>>;

const CLAUDE_ALIASES = ["", "haiku", "sonnet", "opus"];

export default function AdminLlmPage() {

  // DATA
  const [pins, setPins] = useState<Pins>({});
  const [saved, setSaved] = useState<Pins>({});

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let stale = false;
    fetch("/api/admin/llm-recommendations")
      .then((r) => r.json())
      .then((body) => {
        if (stale) return;
        if (body.error) {
          toast.error(body.error);
          return;
        }
        setPins(body);
        setSaved(body);
      })
      .catch(() => { if (!stale) toast.error("Couldn't load recommended models"); })
      .finally(() => { if (!stale) setIsLoading(false); });
    return () => { stale = true; };
  }, []);

  const isDirty = useMemo(() => JSON.stringify(pins) !== JSON.stringify(saved), [pins, saved]);

  function setPin(task: LlmTaskId, backend: LlmBackend, model: string) {
    setPins((prev) => {
      const entry = { ...(prev[task] ?? {}) };
      if (model.trim()) entry[backend] = model;
      else delete entry[backend];
      const next = { ...prev };
      if (Object.keys(entry).length) next[task] = entry;
      else delete next[task];
      return next;
    });
  }

  async function save() {
    setIsSaving(true);
    try {
      const res = await fetch("/api/admin/llm-recommendations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pins),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error || "Couldn't save");
        return;
      }
      setPins(body);
      setSaved(body);
      toast.success("Recommended models saved");
    } catch {
      toast.error("Couldn't save");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BREADCRUMBS */}
        <Breadcrumbs label="Recommended models" />

        {/* PAGE TITLE + HELP */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <h1 className="text-page-title settings-title" style={{ flex: 1, minWidth: 0 }}>
            <Cpu className="w-6 h-6" /> Recommended models
          </h1>
          <HelpButton
            title="Recommended models"
            sections={[
              { heading: "Pins", body: "A pinned model becomes the task's recommended entry for every user and runs for anyone who left the choice blank. Blank keeps the automatic pick." },
              { heading: "Checked", body: "An OpenRouter id must exist and fit the task (read images, call tools, draw) or Save refuses it." },
            ]}
          />
        </div>

        {/* LOADING */}
        {isLoading && (
          <div className="loading-container">
            <div className="loading-spinner" />
          </div>
        )}

        {!isLoading && (
          <>
            {LLM_TASK_GROUPS.map((group) => (
              <div key={group.key}>
                <h3 className="settings-section-title" style={{ fontSize: "0.9rem" }}>{group.label}</h3>
                <div className="settings-group">
                  {LLM_TASKS.filter((t) => t.group === group.key).map((task, i) => (
                    <SettingsControlRow key={task.id} label={task.label} divider={i > 0}>
                      {/* Label column + field column, so each field says which backend it pins
                          even once it holds a value. */}
                      <span style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", columnGap: "0.75rem", rowGap: "0.5rem", alignItems: "center", width: "34rem", maxWidth: "100%" }}>

                        {/* CLAUDE — one of the CLI aliases, or blank */}
                        {!task.openRouterOnly && (
                          <>
                            <span className="text-secondary" style={{ fontSize: "0.8rem" }}>Claude</span>
                            <select
                              className="input-field input-field-compact"
                              style={{ minWidth: 0 }}
                              value={pins[task.id]?.claude ?? ""}
                              aria-label={`${task.label} Claude`}
                              onChange={(e) => setPin(task.id, "claude", e.target.value)}
                            >
                              {CLAUDE_ALIASES.map((a) => <option key={a} value={a}>{a || "Automatic"}</option>)}
                            </select>
                          </>
                        )}

                        {/* OPENROUTER — any model id, or blank */}
                        <span className="text-secondary" style={{ fontSize: "0.8rem" }}>OpenRouter</span>
                        <input
                          type="text"
                          className="input-field input-field-compact font-mono"
                          style={{ minWidth: 0 }}
                          placeholder="Automatic"
                          value={pins[task.id]?.openrouter ?? ""}
                          aria-label={`${task.label} OpenRouter`}
                          onChange={(e) => setPin(task.id, "openrouter", e.target.value)}
                        />
                      </span>
                    </SettingsControlRow>
                  ))}
                </div>
              </div>
            ))}

            {/* SAVE */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <Button className="btn-blue" onClick={save} disabled={!isDirty || isSaving}>
                {isSaving ? "Saving…" : "Save"}
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
