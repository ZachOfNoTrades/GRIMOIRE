"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Pencil } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { ProgramTemplate } from "../../../types/programTemplate";
import DeleteTemplateModal from "./DeleteTemplateModal";

type PromptTab = "program" | "week" | "session" | "analysis";

export default function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // DATA
  const [template, setTemplate] = useState<ProgramTemplate | null>(null);

  // INPUT
  const [editedName, setEditedName] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedProgramPrompt, setEditedProgramPrompt] = useState("");
  const [editedWeekPrompt, setEditedWeekPrompt] = useState("");
  const [editedSessionPrompt, setEditedSessionPrompt] = useState("");
  const [editedAnalysisPrompt, setEditedAnalysisPrompt] = useState("");
  const [editedDaysPerWeek, setEditedDaysPerWeek] = useState(4);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedPromptTab, setSelectedPromptTab] = useState<PromptTab>("program");

  const router = useRouter();

  // Prompt tab configuration
  const promptTabs: { key: PromptTab; label: string }[] = [
    { key: "program", label: "Program" },
    { key: "week", label: "Week" },
    { key: "session", label: "Session" },
    { key: "analysis", label: "Analysis" },
  ];

  // Map prompt tab to edited state
  const promptValues: Record<PromptTab, { value: string; setter: (value: string) => void; dbValue: string | null }> = {
    program: { value: editedProgramPrompt, setter: setEditedProgramPrompt, dbValue: template?.program_prompt ?? null },
    week: { value: editedWeekPrompt, setter: setEditedWeekPrompt, dbValue: template?.week_prompt ?? null },
    session: { value: editedSessionPrompt, setter: setEditedSessionPrompt, dbValue: template?.session_prompt ?? null },
    analysis: { value: editedAnalysisPrompt, setter: setEditedAnalysisPrompt, dbValue: template?.analysis_prompt ?? null },
  };

  // LOAD DATA
  useEffect(() => {
    fetchTemplate();
  }, [id]);

  const fetchTemplate = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/modules/golem/api/program-templates/${id}`);
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to fetch template");
      }
      const data = await response.json();
      setTemplate(data);
    } catch (error) {
      console.error("Error fetching template:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // EDIT HANDLERS
  const handleStartEdit = () => {
    if (!template) return;
    setEditedName(template.name);
    setEditedDescription(template.description || "");
    setEditedProgramPrompt(template.program_prompt || "");
    setEditedWeekPrompt(template.week_prompt || "");
    setEditedSessionPrompt(template.session_prompt || "");
    setEditedAnalysisPrompt(template.analysis_prompt || "");
    setEditedDaysPerWeek(template.days_per_week);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!template) return;
    if (!editedName.trim()) {
      toast.error("Template name is required");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/modules/golem/api/program-templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editedName.trim(),
          description: editedDescription.trim() || null,
          program_prompt: editedProgramPrompt.trim() || null,
          week_prompt: editedWeekPrompt.trim() || null,
          session_prompt: editedSessionPrompt.trim() || null,
          analysis_prompt: editedAnalysisPrompt.trim() || null,
          days_per_week: editedDaysPerWeek,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to update template");
        return;
      }

      const updatedTemplate = await response.json();
      setTemplate(updatedTemplate);
      setIsEditing(false);
      toast.success("Template saved");
    } catch (error) {
      toast.error("Failed to update template");
      console.error("Error saving template:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // DELETE HANDLER
  const handleDeleteTemplate = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/modules/golem/api/program-templates/${id}`, {
        method: "DELETE",
      });

      if (response.status === 409) {
        toast.error("Template is in use by one or more programs");
        setIsDeleteModalOpen(false);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to delete template");
        return;
      }

      toast.success("Template deleted");
      router.push("/modules/golem/ui/templates");
    } catch (error) {
      toast.error("Failed to delete template");
      console.error("Error deleting template:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  // LOADING PLACEHOLDER
  if (isLoading) {
    return (
      <div className="page">
        <main className="page-container">
          <div className="loading-container py-12">
            <div className="loading-spinner" />
          </div>
        </main>
      </div>
    );
  }

  // NOT FOUND PLACEHOLDER
  if (notFound || !template) {
    return (
      <div className="page">
        <main className="page-container">
          <p className="text-page-subtitle text-center py-8">Template not found</p>
        </main>
      </div>
    );
  }

  return (

    // BACKGROUND
    <div className="page">

      <Toaster />

      <main className="page-container">

        {/* HEADER */}
        <div className="mb-8">

          {/* BACK BUTTON */}
          <Button
            onClick={() => router.push("/modules/golem/ui/templates")}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* TITLE */}
          <div className="flex items-center gap-3">
            <h1 className="text-page-title">{template.name}</h1>
          </div>
        </div>

        <div className="card-container">

          {/* TEMPLATE DETAILS CARD */}
          <div className="card">

            {/* CARD HEADER */}
            <div className="card-header">

              {/* TITLE */}
              <h2 className="text-card-title">
                <FileText className="w-5 h-5" />
                Template Details
              </h2>

              {/* ACTIONS */}
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    {/* CANCEL BUTTON */}
                    <Button
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="btn-link"
                    >
                      Cancel
                    </Button>

                    {/* SAVE BUTTON */}
                    <Button
                      onClick={handleSave}
                      disabled={isSaving || !editedName.trim()}
                      className="btn-primary"
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </>
                ) : (
                  <>
                    {/* DELETE BUTTON */}
                    <Button
                      onClick={() => setIsDeleteModalOpen(true)}
                      className="btn-link btn-link-delete"
                    >
                      Delete
                    </Button>

                    {/* EDIT BUTTON */}
                    <Button
                      onClick={handleStartEdit}
                      className="btn-link"
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Edit</span>
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* CARD CONTENT */}
            <div className="card-content">
              {isEditing ? (
                <>
                  {/* NAME INPUT */}
                  <div>
                    <label className="text-secondary">Name</label>
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="input-field"
                      autoFocus
                    />
                  </div>

                  {/* DESCRIPTION INPUT */}
                  <div>
                    <label className="text-secondary">Description</label>
                    <textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      className="input-field min-h-[80px] resize-y"
                      placeholder="Optional description..."
                      rows={3}
                    />
                  </div>

                  {/* DAYS PER WEEK INPUT */}
                  <div>
                    <label className="text-secondary">Days Per Week</label>
                    <input
                      type="number"
                      value={editedDaysPerWeek}
                      onChange={(e) => setEditedDaysPerWeek(parseInt(e.target.value) || 1)}
                      className="input-field w-24"
                      min={1}
                      max={7}
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* NAME */}
                  <div>
                    <label className="text-secondary">Name</label>
                    <p className="text-primary">{template.name}</p>
                  </div>

                  {/* DESCRIPTION */}
                  <div>
                    <label className="text-secondary">Description</label>
                    <p className="text-primary">{template.description || "—"}</p>
                  </div>

                  {/* DAYS PER WEEK */}
                  <div>
                    <label className="text-secondary">Days Per Week</label>
                    <p className="text-primary">{template.days_per_week}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* PROMPTS CARD */}
          <div className="card">

            {/* TAB HEADERS */}
            <nav className="flex space-x-4 px-3 mb-2 border-b border-card" role="tablist">
              {promptTabs.map((tab) => (

                // PROMPT TAB
                <button
                  key={tab.key}
                  className={`tab-button ${selectedPromptTab === tab.key ? "tab-button-active" : ""}`}
                  onClick={() => setSelectedPromptTab(tab.key)}
                  role="tab"
                  aria-selected={selectedPromptTab === tab.key}
                  aria-controls={`${tab.key}-prompt-panel`}
                >
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>

            {/* TAB CONTENT */}
            <div className="card-content" role="tabpanel" id={`${selectedPromptTab}-prompt-panel`}>
              {isEditing ? (

                // PROMPT TEXTAREA (EDIT MODE)
                <textarea
                  value={promptValues[selectedPromptTab].value}
                  onChange={(e) => promptValues[selectedPromptTab].setter(e.target.value)}
                  className="input-field font-mono text-sm min-h-[400px] resize-y"
                  placeholder={`Enter ${selectedPromptTab} prompt...`}
                />
              ) : (

                // PROMPT DISPLAY (VIEW MODE)
                promptValues[selectedPromptTab].dbValue ? (
                  <pre className="text-primary text-sm font-mono whitespace-pre-wrap break-words">
                    {promptValues[selectedPromptTab].dbValue}
                  </pre>
                ) : (
                  <p className="text-secondary text-center py-8">No {selectedPromptTab} prompt configured</p>
                )
              )}
            </div>
          </div>
        </div>

        {/* DELETE TEMPLATE MODAL */}
        <DeleteTemplateModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={handleDeleteTemplate}
          templateName={template.name}
          isDeleting={isDeleting}
        />
      </main>
    </div>
  );
}
