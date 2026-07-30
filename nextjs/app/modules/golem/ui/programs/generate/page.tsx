"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useGoBack } from "@/lib/useGoBack";
import { ArrowLeft, Loader2, Zap, Sparkles, ListChecks, Plus, Trash2, LayoutTemplate, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import { useGenerationJob } from "@/lib/useGenerationJob";
import ArchetypeBuilder from "@/app/modules/golem/components/ArchetypeBuilder";
import type { DayArchetype } from "@/app/modules/golem/types/dayArchetype";
import type { ProgramTemplateSummary } from "@/app/modules/golem/types/programTemplate";

// A manual block while editing: name, week count, and one archetype id per training day ("" = unassigned).
interface ManualBlock {
  name: string;
  weekCount: number;
  days: string[];
}

// Resize a block's per-day archetype array to the given day count (truncate or pad with "").
function normalizeDays(days: string[], count: number): string[] {
  const next = days.slice(0, count);
  while (next.length < count) next.push("");
  return next;
}

export default function GenerateProgramWizardPage() {

  const router = useRouter();
  const goBack = useGoBack();

  // DATA — fetched libraries used by the AI-template and manual branches
  const [templates, setTemplates] = useState<ProgramTemplateSummary[]>([]);
  const [archetypes, setArchetypes] = useState<DayArchetype[]>([]);
  const [muscleGroups, setMuscleGroups] = useState<{ id: string; name: string }[]>([]);
  const [exercises, setExercises] = useState<{ id: string; name: string }[]>([]);

  // INPUT — mode + branch selections
  const [mode, setMode] = useState<"ai" | "manual" | null>(null);
  const [aiSource, setAiSource] = useState<"prompts" | "template" | null>(null);
  // AI · prompts
  const [programPrompt, setProgramPrompt] = useState("");
  const [blockPrompt, setBlockPrompt] = useState("");
  const [weekPrompt, setWeekPrompt] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  // AI · template
  const [templateId, setTemplateId] = useState<string | null>(null);
  // Manual
  const [programName, setProgramName] = useState("");
  const [programDescription, setProgramDescription] = useState("");
  const [manualDaysPerWeek, setManualDaysPerWeek] = useState(4);
  const [manualBlocks, setManualBlocks] = useState<ManualBlock[]>([
    { name: "Block 1", weekCount: 4, days: ["", "", "", ""] },
  ]);

  // STATE — UI flags + derived step model
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState(0);
  const [archetypeModalOpen, setArchetypeModalOpen] = useState(false);

  // GENERATION JOB HOOK — used only by the AI branches (the manual branch is synchronous).
  const { startPolling } = useGenerationJob({
    onComplete: (result) => {
      const { id } = result as { id: string };
      toast.success("Program generated");
      router.push(`/modules/golem/ui/programs/${id}`);
      setIsSubmitting(false);
    },
    onError: (error) => {
      toast.error(error);
      setIsSubmitting(false);
    },
  });

  // Re-fetch the archetype library (used on mount and after creating one inline on the assign step).
  const loadArchetypes = useCallback(async () => {
    try {
      const res = await fetch("/modules/golem/api/day-archetypes");
      if (res.ok) {
        const data = await res.json();
        setArchetypes(data.archetypes ?? []);
      }
    } catch (error) {
      console.error("Error loading day archetypes:", error);
    }
  }, []);

  // LOAD LIBRARIES on mount: templates (AI-template path), archetypes + muscle/exercise option lists
  // (manual path — the latter two feed the inline ArchetypeBuilder's slot editor).
  useEffect(() => {
    const load = async () => {
      try {
        const [templatesRes, muscleRes, exerciseRes] = await Promise.all([
          fetch("/modules/golem/api/program-templates"),
          fetch("/modules/golem/api/muscle-groups"),
          fetch("/modules/golem/api/exercises"),
          loadArchetypes(),
        ]);
        if (templatesRes.ok) setTemplates(await templatesRes.json());
        if (muscleRes.ok) {
          const mg = await muscleRes.json();
          setMuscleGroups(Array.isArray(mg) ? mg : []);
        }
        if (exerciseRes.ok) {
          const ex = await exerciseRes.json();
          setExercises((ex?.exercises ?? []).map((e: { id: string; name: string }) => ({ id: e.id, name: e.name })));
        }
      } catch (error) {
        console.error("Error loading generation libraries:", error);
      } finally {
        setIsLoadingData(false);
      }
    };
    load();
  }, [loadArchetypes]);

  // Ordered list of screens for the chosen branch. step indexes into this; the last screen is "review".
  const screens = useMemo<string[]>(() => {
    if (mode === "ai") {
      if (aiSource === "prompts") return ["mode", "aiSource", "prompts", "review"];
      if (aiSource === "template") return ["mode", "aiSource", "template", "review"];
      return ["mode", "aiSource"];
    }
    if (mode === "manual") return ["mode", "name", "blocks", "assign", "review"];
    return ["mode"];
  }, [mode, aiSource]);

  const currentScreen = screens[step] ?? "mode";
  // The last screen is always "review" — guard on length so the single-screen mode-chooser state
  // (before a mode is picked) shows "Next", not the final submit label.
  const isLastStep = step === screens.length - 1 && screens.length > 1;
  const hasArchetypes = archetypes.length > 0;

  // VALIDATION — can the user advance from the current screen?
  const canAdvance = (): boolean => {
    switch (currentScreen) {
      case "mode":
        return mode !== null;
      case "aiSource":
        return aiSource !== null;
      case "prompts":
        return (
          Boolean(programPrompt.trim() || blockPrompt.trim() || weekPrompt.trim()) &&
          daysPerWeek >= 1 &&
          daysPerWeek <= 7
        );
      case "template":
        return templateId !== null;
      case "name":
        return programName.trim().length > 0 && manualDaysPerWeek >= 1 && manualDaysPerWeek <= 7;
      case "blocks":
        return manualBlocks.length > 0 && manualBlocks.every((b) => b.name.trim() && b.weekCount >= 1);
      case "assign":
        return hasArchetypes && manualBlocks.every((b) => b.days.every((d) => d !== ""));
      case "review":
        return true;
      default:
        return false;
    }
  };

  // When entering the manual block/assign steps, keep every block's day array sized to manualDaysPerWeek.
  const syncManualDays = () => {
    setManualBlocks((prev) => prev.map((b) => ({ ...b, days: normalizeDays(b.days, manualDaysPerWeek) })));
  };

  const handleNext = () => {
    if (!canAdvance()) return;
    if (isLastStep) {
      handleSubmit();
      return;
    }
    // Leaving the manual name step: resize all blocks to the chosen day count before assignment.
    if (currentScreen === "name") syncManualDays();
    setStep(step + 1);
  };

  const handleBack = () => {
    if (step === 0) {
      goBack("/modules/golem/ui/home");
      return;
    }
    setStep(step - 1);
  };

  // SUBMIT — dispatch to the route for the chosen branch.
  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // MANUAL — synchronous; returns the program id directly.
      if (mode === "manual") {
        const blocks = manualBlocks.map((b) => ({
          name: b.name.trim(),
          weekCount: b.weekCount,
          days: b.days.map((archetypeId, index) => ({ dayIndex: index + 1, archetypeId })),
        }));
        const response = await fetch("/modules/golem/api/programs/generate-manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: programName.trim(), description: programDescription.trim() || null, blocks }),
        });
        if (response.ok) {
          const { id } = await response.json();
          toast.success("Program created");
          router.push(`/modules/golem/ui/programs/${id}`);
          return;
        }
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to create program");
        setIsSubmitting(false);
        return;
      }

      // AI — async job + polling. Pick the route for the sub-source.
      const url =
        aiSource === "template"
          ? "/modules/golem/api/programs/generate"
          : "/modules/golem/api/programs/generate-engine";
      const payload =
        aiSource === "template"
          ? { templateId }
          : { programPrompt, blockPrompt, weekPrompt, daysPerWeek };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 202) {
        const { jobId } = await response.json();
        startPolling(jobId);
        return;
      }

      const errorData = await response.json();
      toast.error(errorData.error || "Failed to generate program");
      setIsSubmitting(false);
    } catch (error) {
      console.error("Error generating program:", error);
      toast.error("Failed to generate program");
      setIsSubmitting(false);
    }
  };

  // Mutators for the manual block list.
  const addBlock = () => {
    setManualBlocks((prev) => [
      ...prev,
      { name: `Block ${prev.length + 1}`, weekCount: 4, days: normalizeDays([], manualDaysPerWeek) },
    ]);
  };

  const removeBlock = (index: number) => {
    setManualBlocks((prev) => prev.filter((_, i) => i !== index));
  };

  const updateBlock = (index: number, patch: Partial<ManualBlock>) => {
    setManualBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const assignDay = (blockIndex: number, dayIndex: number, archetypeId: string) => {
    setManualBlocks((prev) =>
      prev.map((b, i) => {
        if (i !== blockIndex) return b;
        const days = b.days.slice();
        days[dayIndex] = archetypeId;
        return { ...b, days };
      }),
    );
  };

  const isReviewBusy = isSubmitting;

  return (

    // BACKGROUND
    <div className="page">

      <main className="page-container">

        {/* HEADER */}
        <div className="mb-6">

          {/* BACK BUTTON */}
          <Button onClick={handleBack} className="btn-link !pl-0" disabled={isSubmitting}>
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* TITLE */}
          <h1 className="text-page-title">Generate Program</h1>

          {/* PROGRESS INDICATOR */}
          <div className="wizard-progress mt-3" aria-label={`Step ${step + 1} of ${screens.length}`}>
            {screens.map((_, i) => (
              <span key={i} data-filled={i <= step ? "true" : "false"} />
            ))}
          </div>
        </div>

        {/* LOADING PLACEHOLDER */}
        {isLoadingData ? (
          <div className="card">
            <div className="card-content flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-secondary" />
            </div>
          </div>
        ) : (

          // WIZARD BODY
          <div className="card mb-6">
            <div className="card-content flex flex-col gap-4">

              {/* SCREEN: MODE CHOOSER */}
              {currentScreen === "mode" && (
                <Step title="How do you want to build this program?">

                  {/* AI OPTION */}
                  <OptionCard
                    icon={<Sparkles className="w-5 h-5 option-card-icon" />}
                    title="Generate with AI"
                    description="Describe what you want (or pick a template) and let the assistant design the structure."
                    selected={mode === "ai"}
                    onClick={() => setMode("ai")}
                  />

                  {/* MANUAL OPTION */}
                  <OptionCard
                    icon={<ListChecks className="w-5 h-5 option-card-icon" />}
                    title="Build manually"
                    description="Set the blocks and weeks yourself and assign a day archetype to each training day. No AI."
                    selected={mode === "manual"}
                    onClick={() => setMode("manual")}
                  />
                </Step>
              )}

              {/* SCREEN: AI SOURCE CHOOSER */}
              {currentScreen === "aiSource" && (
                <Step title="What should the AI work from?">

                  {/* FROM A DESCRIPTION */}
                  <OptionCard
                    icon={<FileText className="w-5 h-5 option-card-icon" />}
                    title="From a description"
                    description="Write your program goal, block structure, and week-to-week progression in your own words."
                    selected={aiSource === "prompts"}
                    onClick={() => setAiSource("prompts")}
                  />

                  {/* FROM A SAVED TEMPLATE */}
                  <OptionCard
                    icon={<LayoutTemplate className="w-5 h-5 option-card-icon" />}
                    title="From a saved template"
                    description="Generate from one of your reusable program templates."
                    selected={aiSource === "template"}
                    onClick={() => setAiSource("template")}
                  />
                </Step>
              )}

              {/* SCREEN: AI PROMPTS */}
              {currentScreen === "prompts" && (
                <Step title="Describe the program">

                  {/* DAYS PER WEEK */}
                  <div className="flex flex-col gap-1">
                    <label className="text-secondary">Training days per week</label>
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={daysPerWeek}
                      onChange={(e) => setDaysPerWeek(Number(e.target.value))}
                      className="input-field w-24"
                    />
                  </div>

                  {/* PROGRAM PROMPT */}
                  <div className="flex flex-col gap-1">
                    <label className="text-secondary">Program goal</label>
                    <textarea
                      value={programPrompt}
                      onChange={(e) => setProgramPrompt(e.target.value)}
                      rows={3}
                      className="input-field w-full"
                      placeholder="e.g. 12-week program to build muscle and add strength on the main lifts; intermediate lifter."
                    />
                  </div>

                  {/* BLOCK PROMPT */}
                  <div className="flex flex-col gap-1">
                    <label className="text-secondary">Blocks / phases</label>
                    <textarea
                      value={blockPrompt}
                      onChange={(e) => setBlockPrompt(e.target.value)}
                      rows={3}
                      className="input-field w-full"
                      placeholder="e.g. Three 4-week blocks: hypertrophy, then strength, then a peak. End each block lighter."
                    />
                  </div>

                  {/* WEEK PROMPT */}
                  <div className="flex flex-col gap-1">
                    <label className="text-secondary">Progression within a block</label>
                    <textarea
                      value={weekPrompt}
                      onChange={(e) => setWeekPrompt(e.target.value)}
                      rows={3}
                      className="input-field w-full"
                      placeholder="e.g. Push reps/intensity up week to week; keep the same day split throughout each block."
                    />
                  </div>
                </Step>
              )}

              {/* SCREEN: AI TEMPLATE PICKER */}
              {currentScreen === "template" && (
                <Step title="Pick a template">

                  {templates.length === 0 ? (

                    // EMPTY STATE — no templates exist
                    <div className="flex flex-col gap-3 items-start">
                      <p className="text-secondary">You don&apos;t have any program templates yet.</p>
                      <Button
                        className="btn-off"
                        onClick={() => router.push("/modules/golem/ui/templates")}
                      >
                        <LayoutTemplate className="w-4 h-4" />
                        <span>Manage templates</span>
                      </Button>
                    </div>
                  ) : (

                    // TEMPLATE LIST
                    <div className="flex flex-col gap-2">
                      {templates.map((template) => (
                        <OptionCard
                          key={template.id}
                          icon={<LayoutTemplate className="w-5 h-5 option-card-icon" />}
                          title={template.name}
                          description={template.description ?? "No description"}
                          selected={templateId === template.id}
                          onClick={() => setTemplateId(template.id)}
                        />
                      ))}
                    </div>
                  )}
                </Step>
              )}

              {/* SCREEN: MANUAL NAME */}
              {currentScreen === "name" && (
                <Step title="Name your program">

                  {/* PROGRAM NAME */}
                  <div className="flex flex-col gap-1">
                    <label className="text-secondary">Program name</label>
                    <input
                      type="text"
                      value={programName}
                      onChange={(e) => setProgramName(e.target.value)}
                      className="input-field w-full"
                      placeholder="e.g. Winter Strength Block"
                    />
                  </div>

                  {/* PROGRAM DESCRIPTION */}
                  <div className="flex flex-col gap-1">
                    <label className="text-secondary">Description (optional)</label>
                    <textarea
                      value={programDescription}
                      onChange={(e) => setProgramDescription(e.target.value)}
                      rows={2}
                      className="input-field w-full"
                      placeholder="A short note about the goal of this program."
                    />
                  </div>

                  {/* DAYS PER WEEK */}
                  <div className="flex flex-col gap-1">
                    <label className="text-secondary">Training days per week</label>
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={manualDaysPerWeek}
                      onChange={(e) => setManualDaysPerWeek(Number(e.target.value))}
                      className="input-field w-24"
                    />
                  </div>
                </Step>
              )}

              {/* SCREEN: MANUAL BLOCKS */}
              {currentScreen === "blocks" && (
                <Step title="Define your blocks">

                  {/* BLOCK LIST */}
                  <div className="flex flex-col gap-3">
                    {manualBlocks.map((block, index) => (

                      // BLOCK ROW
                      <div key={index} className="card">
                        <div className="card-content flex items-end gap-3">

                          {/* BLOCK NAME */}
                          <div className="flex flex-col gap-1 flex-1">
                            <label className="text-secondary">Block name</label>
                            <input
                              type="text"
                              value={block.name}
                              onChange={(e) => updateBlock(index, { name: e.target.value })}
                              className="input-field w-full"
                            />
                          </div>

                          {/* WEEK COUNT */}
                          <div className="flex flex-col gap-1">
                            <label className="text-secondary">Weeks</label>
                            <input
                              type="number"
                              min={1}
                              max={52}
                              value={block.weekCount}
                              onChange={(e) => updateBlock(index, { weekCount: Number(e.target.value) })}
                              className="input-field w-20"
                            />
                          </div>

                          {/* REMOVE BLOCK */}
                          <Button
                            className="btn-off"
                            onClick={() => removeBlock(index)}
                            disabled={manualBlocks.length === 1}
                            aria-label="Remove block"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ADD BLOCK */}
                  <Button className="btn-off self-start" onClick={addBlock}>
                    <Plus className="w-4 h-4" />
                    <span>Add block</span>
                  </Button>
                </Step>
              )}

              {/* SCREEN: MANUAL ARCHETYPE ASSIGNMENT */}
              {currentScreen === "assign" && (
                <Step title="Assign a day archetype to each day">

                  {!hasArchetypes ? (

                    // EMPTY STATE — manual branch needs at least one archetype
                    <div className="flex flex-col gap-3 items-start">
                      <p className="text-secondary">
                        You need at least one day archetype before you can build a program manually. Day
                        archetypes are the training-day blueprints the engine generates exercises from.
                      </p>

                      {/* CREATE FIRST ARCHETYPE */}
                      <Button className="btn-blue" onClick={() => setArchetypeModalOpen(true)}>
                        <Plus className="w-4 h-4" />
                        <span>New archetype</span>
                      </Button>

                      {/* OPEN FULL EDITOR */}
                      <Button className="btn-link !pl-0" onClick={() => router.push("/modules/golem/ui/archetypes")}>
                        <ListChecks className="w-4 h-4" />
                        <span>Manage day archetypes</span>
                      </Button>
                    </div>
                  ) : (

                    // PER-BLOCK DAY ASSIGNMENT
                    <div className="flex flex-col gap-4">

                      {/* NEW ARCHETYPE — build a full archetype (name + slots) without leaving the wizard */}
                      <div className="flex items-center justify-between">
                        <p className="text-subtle">Need another training day? Build one here without leaving the wizard.</p>
                        <Button className="btn-off shrink-0" onClick={() => setArchetypeModalOpen(true)}>
                          <Plus className="w-4 h-4" />
                          <span>New archetype</span>
                        </Button>
                      </div>

                      {manualBlocks.map((block, blockIndex) => (

                        // BLOCK ASSIGNMENT GROUP
                        <div key={blockIndex} className="flex flex-col gap-2">

                          {/* BLOCK LABEL */}
                          <h3 className="text-card-title">{block.name || `Block ${blockIndex + 1}`}</h3>

                          {/* DAY ROWS */}
                          {block.days.map((archetypeId, dayIndex) => (
                            <div key={dayIndex} className="flex items-center gap-3">

                              {/* DAY LABEL */}
                              <span className="text-secondary w-16">Day {dayIndex + 1}</span>

                              {/* ARCHETYPE SELECT */}
                              <select
                                value={archetypeId}
                                onChange={(e) => assignDay(blockIndex, dayIndex, e.target.value)}
                                className="input-field flex-1"
                              >
                                <option value="">Select an archetype…</option>
                                {archetypes.map((archetype) => (
                                  <option key={archetype.id} value={archetype.id}>
                                    {archetype.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </Step>
              )}

              {/* SCREEN: REVIEW */}
              {currentScreen === "review" && (
                <Step title="Review">

                  {/* REVIEW SUMMARY */}
                  <div className="flex flex-col gap-2 text-secondary">

                    {mode === "manual" ? (

                      // MANUAL SUMMARY
                      <>
                        <p><span className="text-primary">Program:</span> {programName}</p>
                        <p><span className="text-primary">Days/week:</span> {manualDaysPerWeek}</p>
                        <p>
                          <span className="text-primary">Blocks:</span>{" "}
                          {manualBlocks.map((b) => `${b.name} (${b.weekCount}w)`).join(", ")}
                        </p>
                        <p className="text-subtle">
                          The engine fills in exercises per session from your history once you start a workout.
                        </p>
                      </>
                    ) : aiSource === "template" ? (

                      // AI TEMPLATE SUMMARY
                      <>
                        <p>
                          <span className="text-primary">Template:</span>{" "}
                          {templates.find((t) => t.id === templateId)?.name ?? "—"}
                        </p>
                        <p className="text-subtle">The assistant will build the full program from this template.</p>
                      </>
                    ) : (

                      // AI PROMPTS SUMMARY
                      <>
                        <p><span className="text-primary">Days/week:</span> {daysPerWeek}</p>
                        <p className="text-subtle">
                          The assistant designs the structure and assigns a day archetype to each training day;
                          the engine fills in exercises per session from your history.
                        </p>
                      </>
                    )}
                  </div>
                </Step>
              )}
            </div>
          </div>
        )}

        {/* FOOTER ACTIONS */}
        {!isLoadingData && (
          <div className="flex justify-end">
            <Button
              className="btn-blue"
              onClick={handleNext}
              disabled={!canAdvance() || isReviewBusy}
            >
              {isReviewBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isLastStep ? (
                <Zap className="w-4 h-4" />
              ) : null}
              {isReviewBusy
                ? mode === "manual"
                  ? "Creating..."
                  : "Generating..."
                : isLastStep
                  ? mode === "manual"
                    ? "Create Program"
                    : "Generate Program"
                  : "Next"}
            </Button>
          </div>
        )}
      </main>

      {/* NEW ARCHETYPE BUILDER — full build (name + slots), then refresh the picker list */}
      {archetypeModalOpen && (
        <ArchetypeBuilder
          isOpen={archetypeModalOpen}
          onClose={() => setArchetypeModalOpen(false)}
          onCreated={() => loadArchetypes()}
          muscleGroups={muscleGroups}
          exercises={exercises}
        />
      )}
    </div>
  );
}

// STEP WRAPPER — title + vertically stacked content (mirrors the forage wizard's Step helper).
function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      {/* STEP TITLE */}
      <h2 className="text-card-title mb-4">{title}</h2>

      {/* STEP CONTENT */}
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

// OPTION CARD — a selectable card with an icon, title, and description (uses the global .option-card styles).
function OptionCard({
  icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="option-card" aria-pressed={selected} onClick={onClick}>
      {/* ICON */}
      {icon}

      {/* BODY */}
      <div className="option-card-body">
        <span className="option-card-title">{title}</span>
        <span className="option-card-desc">{description}</span>
      </div>
    </button>
  );
}
