"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowRight, Sparkles, Loader2, Plus, Pencil, Trash2, Check } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { useGenerationJob } from "@/lib/useGenerationJob";
import type { ProposedChange } from "../../../types/generation";

interface RefineDeckModalProps {
  isOpen: boolean;
  deckId: string;
  onClose: () => void;
  onApplied: () => void;
}

type Step = "prompt" | "loading" | "review" | "applying" | "done";

export default function RefineDeckModal({ isOpen, deckId, onClose, onApplied }: RefineDeckModalProps) {

  // INPUT
  const [feedback, setFeedback] = useState("");

  // STATE
  const [step, setStep] = useState<Step>("prompt");
  const [changes, setChanges] = useState<ProposedChange[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [applyResult, setApplyResult] = useState<{ updated: number; inserted: number; deleted: number } | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFeedback("");
      setStep("prompt");
      setChanges([]);
      setSelectedIndices(new Set());
      setApplyResult(null);
    }
  }, [isOpen]);

  // Job polling for LLM proposal
  const { startPolling } = useGenerationJob({
    onComplete: (result) => {
      const proposal = result as { changes: ProposedChange[] };
      setChanges(proposal.changes);
      // Select all by default
      setSelectedIndices(new Set(proposal.changes.map((_, i) => i)));
      setStep("review");
    },
    onError: (error) => {
      toast.error(error || "Refinement failed");
      setStep("prompt");
    },
  });

  // Submit feedback to LLM
  const handleSubmitFeedback = async () => {
    if (!feedback.trim()) return;

    setStep("loading");
    try {
      const response = await fetch(`/modules/rune/api/decks/${deckId}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedback.trim() }),
      });

      if (response.status === 202) {
        const { jobId } = await response.json();
        startPolling(jobId);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to start refinement");
        setStep("prompt");
      }
    } catch (error) {
      console.error("Error starting refinement:", error);
      toast.error("Failed to start refinement");
      setStep("prompt");
    }
  };

  // Update a proposed field on a change
  const updateProposedField = (index: number, field: "proposedFront" | "proposedBack" | "proposedNotes", value: string) => {
    setChanges((prev) => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  // Auto-resize textarea: expands with content up to 10 lines, then scrolls
  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const maxHeight = lineHeight * 10 + 16; // 10 lines + padding
    const newHeight = el.scrollHeight;
    el.style.height = Math.min(newHeight, maxHeight) + "px";
    el.style.overflowY = newHeight > maxHeight ? "auto" : "hidden";
  }, []);

  // Toggle individual change selection
  const toggleChange = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) { next.delete(index); } else { next.add(index); }
    setSelectedIndices(next);
  };

  // Toggle select all
  const toggleSelectAll = () => {
    if (selectedIndices.size === changes.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(changes.map((_, i) => i)));
    }
  };

  // Apply approved changes
  const handleApply = async () => {
    const approvedChanges = changes.filter((_, i) => selectedIndices.has(i));
    if (approvedChanges.length === 0) return;

    setStep("applying");
    try {
      const response = await fetch(`/modules/rune/api/decks/${deckId}/refine`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvedChanges }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to apply changes");
        setStep("review");
        return;
      }

      const result = await response.json();
      setApplyResult(result);
      setStep("done");
    } catch (error) {
      console.error("Error applying refinement:", error);
      toast.error("Failed to apply changes");
      setStep("review");
    }
  };

  // Close and notify parent to refetch
  const handleDone = () => {
    onApplied();
    onClose();
  };

  // Derived counts
  const addedCount = changes.filter((c, i) => c.type === "added" && selectedIndices.has(i)).length;
  const modifiedCount = changes.filter((c, i) => c.type === "modified" && selectedIndices.has(i)).length;
  const deletedCount = changes.filter((c, i) => c.type === "deleted" && selectedIndices.has(i)).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={step === "loading" || step === "applying" ? () => {} : onClose}
      disableClose={step === "loading" || step === "applying"}
      title="Refine Deck"
      fullHeight={step === "review"}
      footer={
        <>
          {/* PROMPT STEP FOOTER */}
          {step === "prompt" && (
            <div className="flex gap-2 justify-end">
              <Button onClick={onClose} className="btn-off">Cancel</Button>
              <Button
                onClick={handleSubmitFeedback}
                className="btn-blue"
                disabled={!feedback.trim()}
              >
                <Sparkles className="w-4 h-4" />
                Generate Changes
              </Button>
            </div>
          )}

          {/* REVIEW STEP FOOTER */}
          {step === "review" && (
            <div className="flex gap-2 justify-between">
              <Button onClick={() => setStep("prompt")} className="btn-off">Back</Button>
              <Button
                onClick={handleApply}
                className="btn-blue"
                disabled={selectedIndices.size === 0}
              >
                <Check className="w-4 h-4" />
                Apply {selectedIndices.size} Change{selectedIndices.size !== 1 ? "s" : ""}
              </Button>
            </div>
          )}

          {/* DONE STEP FOOTER */}
          {step === "done" && (
            <div className="flex gap-2 justify-end">
              <Button onClick={handleDone} className="btn-blue">Done</Button>
            </div>
          )}
        </>
      }
    >
      {/* STEP INDICATOR */}
      <div className="flex items-center justify-between mb-6 text-center max-w-sm mx-auto">

        {/* PROMPT STEP */}
        <div className={`flex items-center ${step === "prompt" ? "text-primary" : "text-muted"}`}>
          <div className={step === "prompt" ? "badge-blue" : "badge-gray"}>1</div>
          <span className="ml-2 font-medium">Prompt</span>
        </div>

        {/* ARROW */}
        <ArrowRight className="text-muted w-4 h-4" />

        {/* REVIEW STEP */}
        <div className={`flex items-center ${step === "review" || step === "loading" ? "text-primary" : "text-muted"}`}>
          <div className={step === "review" || step === "loading" ? "badge-blue" : "badge-gray"}>2</div>
          <span className="ml-2 font-medium">Review</span>
        </div>

        {/* ARROW */}
        <ArrowRight className="text-muted w-4 h-4" />

        {/* APPLY STEP */}
        <div className={`flex items-center ${step === "applying" || step === "done" ? "text-primary" : "text-muted"}`}>
          <div className={step === "applying" || step === "done" ? "badge-blue" : "badge-gray"}>3</div>
          <span className="ml-2 font-medium">Apply</span>
        </div>
      </div>

      {/* PROMPT STEP */}
      {step === "prompt" && (
        <div>
          {/* FEEDBACK INPUT */}
          <label className="text-label mb-1 block">Feedback</label>
          <textarea
            className="input-field w-full min-h-[100px] resize-y"
            rows={4}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmitFeedback(); } }}
            placeholder="e.g. Make all answers more concise, remove physics questions, re-read notion page for new info..."
            autoFocus
          />
        </div>
      )}

      {/* LOADING STEP */}
      {step === "loading" && (
        <div className="loading-container py-12">
          <div className="loading-spinner" />
          <p className="text-secondary mt-4">Generating proposed changes...</p>
        </div>
      )}

      {/* REVIEW STEP */}
      {step === "review" && (
        <div>
          {/* EMPTY STATE */}
          {changes.length === 0 && (
            <p className="text-secondary text-center py-8">No changes proposed.</p>
          )}

          {/* CHANGES LIST */}
          {changes.length > 0 && (<>

            {/* TOOLBAR */}
            <div className="flex items-center justify-between mb-4">

              {/* SELECT ALL */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIndices.size === changes.length}
                  onChange={toggleSelectAll}
                  className="checkbox"
                />
                <span className="text-secondary text-sm">
                  Select all ({changes.length})
                </span>
              </label>

              {/* SUMMARY BADGES */}
              <div className="flex gap-2">
                {addedCount > 0 && <span className="badge-green">{addedCount} added</span>}
                {modifiedCount > 0 && <span className="badge-yellow">{modifiedCount} modified</span>}
                {deletedCount > 0 && <span className="badge-red">{deletedCount} deleted</span>}
              </div>
            </div>

            {/* CHANGE CARDS */}
            <div className="flex flex-col gap-3 overflow-y-auto max-h-[55vh]">
              {changes.map((change, index) => (

                // CHANGE CARD
                <div
                  key={index}
                  className={`sub-card !transition-none ${!selectedIndices.has(index) ? "opacity-50" : ""}`}
                >
                  {/* CARD HEADER */}
                  <div className="sub-card-header">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedIndices.has(index)}
                        onChange={() => toggleChange(index)}
                        className="checkbox"
                      />
                      {change.type === "added" && <span className="badge-green"><Plus className="w-3 h-3 inline -mt-px" /> Add</span>}
                      {change.type === "modified" && <span className="badge-yellow"><Pencil className="w-3 h-3 inline -mt-px" /> Edit</span>}
                      {change.type === "deleted" && <span className="badge-red"><Trash2 className="w-3 h-3 inline -mt-px" /> Delete</span>}
                    </label>
                  </div>

                  {/* CARD CONTENT */}
                  <div className="sub-card-content">

                    {/* === ADDED === */}
                    {change.type === "added" && (<>

                      {/* FRONT */}
                      <div>
                        <p className="text-subtle text-xs mb-0.5">FRONT</p>
                        <textarea
                          className="input-field w-full text-sm resize-none"
                          rows={1}
                          ref={autoResize}
                          onInput={(e) => autoResize(e.currentTarget)}
                          value={change.proposedFront || ""}
                          onChange={(e) => updateProposedField(index, "proposedFront", e.target.value)}
                        />
                      </div>

                      {/* BACK */}
                      <div>
                        <p className="text-subtle text-xs mb-0.5">BACK</p>
                        <textarea
                          className="input-field w-full text-sm resize-none"
                          rows={1}
                          ref={autoResize}
                          onInput={(e) => autoResize(e.currentTarget)}
                          value={change.proposedBack || ""}
                          onChange={(e) => updateProposedField(index, "proposedBack", e.target.value)}
                        />
                      </div>

                      {/* NOTES */}
                      <div>
                        <p className="text-subtle text-xs mb-0.5">NOTES</p>
                        <textarea
                          className="input-field w-full text-sm resize-none"
                          rows={1}
                          ref={autoResize}
                          onInput={(e) => autoResize(e.currentTarget)}
                          value={change.proposedNotes || ""}
                          onChange={(e) => updateProposedField(index, "proposedNotes", e.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                    </>)}

                    {/* === MODIFIED === */}
                    {change.type === "modified" && (<>

                      {/* FRONT */}
                      <div>
                        <p className="text-subtle text-xs mb-0.5">FRONT</p>
                        {change.originalFront !== change.proposedFront && (
                          <p className="text-subtle text-sm line-through mb-1">{change.originalFront}</p>
                        )}
                        <textarea
                          className="input-field w-full text-sm resize-none"
                          rows={1}
                          ref={autoResize}
                          onInput={(e) => autoResize(e.currentTarget)}
                          value={change.proposedFront || ""}
                          onChange={(e) => updateProposedField(index, "proposedFront", e.target.value)}
                        />
                      </div>

                      {/* BACK */}
                      <div>
                        <p className="text-subtle text-xs mb-0.5">BACK</p>
                        {change.originalBack !== change.proposedBack && (
                          <p className="text-subtle text-sm line-through mb-1">{change.originalBack}</p>
                        )}
                        <textarea
                          className="input-field w-full text-sm resize-none"
                          rows={1}
                          ref={autoResize}
                          onInput={(e) => autoResize(e.currentTarget)}
                          value={change.proposedBack || ""}
                          onChange={(e) => updateProposedField(index, "proposedBack", e.target.value)}
                        />
                      </div>

                      {/* NOTES */}
                      <div>
                        <p className="text-subtle text-xs mb-0.5">NOTES</p>
                        {change.originalNotes !== change.proposedNotes && change.originalNotes && (
                          <p className="text-subtle text-sm line-through mb-1">{change.originalNotes}</p>
                        )}
                        <textarea
                          className="input-field w-full text-sm resize-none"
                          rows={1}
                          ref={autoResize}
                          onInput={(e) => autoResize(e.currentTarget)}
                          value={change.proposedNotes || ""}
                          onChange={(e) => updateProposedField(index, "proposedNotes", e.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                    </>)}

                    {/* === DELETED === */}
                    {change.type === "deleted" && (<>

                      {/* FRONT */}
                      <div>
                        <p className="text-subtle text-xs mb-0.5">FRONT</p>
                        <p className="text-subtle text-sm line-through">{change.originalFront}</p>
                      </div>

                      {/* BACK */}
                      <div>
                        <p className="text-subtle text-xs mb-0.5">BACK</p>
                        <p className="text-subtle text-sm line-through">{change.originalBack}</p>
                      </div>

                      {/* NOTES */}
                      {change.originalNotes && (
                        <div>
                          <p className="text-subtle text-xs mb-0.5">NOTES</p>
                          <p className="text-subtle text-sm line-through">{change.originalNotes}</p>
                        </div>
                      )}
                    </>)}
                  </div>
                </div>
              ))}
            </div>
          </>)}
        </div>
      )}

      {/* APPLYING STEP */}
      {step === "applying" && (
        <div className="loading-container py-12">
          <div className="loading-spinner" />
          <p className="text-secondary mt-4">Applying changes...</p>
        </div>
      )}

      {/* DONE STEP */}
      {step === "done" && applyResult && (
        <div className="text-center py-8">
          <p className="text-primary text-lg font-medium mb-4">Changes Applied</p>
          <div className="flex gap-4 justify-center">
            {applyResult.updated > 0 && (
              <div>
                <p className="stat-value text-alert-yellow">{applyResult.updated}</p>
                <p className="text-secondary text-sm">Modified</p>
              </div>
            )}
            {applyResult.inserted > 0 && (
              <div>
                <p className="stat-value text-alert-green">{applyResult.inserted}</p>
                <p className="text-secondary text-sm">Added</p>
              </div>
            )}
            {applyResult.deleted > 0 && (
              <div>
                <p className="stat-value text-alert-red">{applyResult.deleted}</p>
                <p className="text-secondary text-sm">Deleted</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
