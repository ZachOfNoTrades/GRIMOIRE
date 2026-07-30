"use client";

import React, { useEffect, useRef, useState } from "react";
import { Upload, CheckCircle, AlertCircle, ArrowRight, File } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { parseWorkbooks } from "../../utils/importUtils";
import { ImportPayload, ImportPreview, ImportResult } from "../../types/import";

interface ImportMacroFactorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

type Step = "upload" | "preview" | "processing" | "results";

export default function ImportMacroFactorModal({
  isOpen,
  onClose,
  onImported,
}: ImportMacroFactorModalProps) {
  // DATA
  const [workbookA, setWorkbookA] = useState<File | null>(null);
  const [workbookB, setWorkbookB] = useState<File | null>(null);
  const [payload, setPayload] = useState<ImportPayload | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // STATE
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState<string | null>(null);

  // REFS
  const fileInputARef = useRef<HTMLInputElement>(null);
  const fileInputBRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) resetState();
  }, [isOpen]);

  function resetState() {
    setStep("upload");
    setWorkbookA(null);
    setWorkbookB(null);
    setPayload(null);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  async function handleParse() {
    if (!workbookA || !workbookB) {
      toast.error("Both workbooks required");
      return;
    }
    try {
      const [bufA, bufB] = await Promise.all([
        workbookA.arrayBuffer(),
        workbookB.arrayBuffer(),
      ]);
      const parsed = parseWorkbooks(bufA, bufB);
      setPayload(parsed.payload);
      setPreview(parsed.preview);
      setStep("preview");
    } catch (e: any) {
      console.error(e);
      toast.error(`Parse failed: ${e.message}`);
    }
  }

  async function handleImport() {
    if (!payload) return;
    setStep("processing");
    setError(null);
    try {
      const response = await fetch("/modules/forage/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Import failed");
      }
      const r: ImportResult = await response.json();
      setResult(r);
      setStep("results");
    } catch (e: any) {
      console.error(e);
      setError(e.message ?? "Import failed");
      setStep("results");
    }
  }

  function handleClose() {
    if (result) onImported();
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import from MacroFactor"
      disableClose={step === "processing"}
    >
      {/* STEP INDICATOR */}
      <div className="flex items-center justify-between mb-8 text-center max-w-lg mx-auto">

        {/* UPLOAD STEP */}
        <div className={`flex items-center ${step === "upload" ? "text-primary" : "text-muted"}`}>
          <div className={step === "upload" ? "badge-blue" : "badge-gray"}>1</div>
          <span className="ml-2 font-medium">Upload</span>
        </div>

        {/* ARROW */}
        <ArrowRight className="text-muted w-5 h-5" />

        {/* PREVIEW STEP */}
        <div className={`flex items-center ${step === "preview" ? "text-primary" : "text-muted"}`}>
          <div className={step === "preview" ? "badge-blue" : "badge-gray"}>2</div>
          <span className="ml-2 font-medium">Preview</span>
        </div>

        {/* ARROW */}
        <ArrowRight className="text-muted w-5 h-5" />

        {/* IMPORT STEP */}
        <div className={`flex items-center ${step === "processing" || step === "results" ? "text-primary" : "text-muted"}`}>
          <div className={step === "processing" || step === "results" ? "badge-blue" : "badge-gray"}>3</div>
          <span className="ml-2 font-medium">Import</span>
        </div>
      </div>

      {/* STEP 1 — UPLOAD */}
      {step === "upload" && (
        <div className="space-y-4">

          {/* WORKBOOK A DROPZONE */}
          <div className="flex flex-col border-2 border-dashed rounded-lg p-6 text-center border-[var(--card-border)] hover:border-[var(--input-border)]">
            <Upload className="text-secondary w-8 h-8 mx-auto mb-2" />
            <h3 className="text-primary !text-base !font-medium mb-1">Workbook A</h3>
            <p className="text-secondary text-sm mb-4">
              The 18-sheet workbook (Calories &amp; Macros, Scale Weight, Recipes, …)
            </p>
            <Button onClick={() => fileInputARef.current?.click()} className="btn-blue">
              <File className="h-4 w-4" />
              {workbookA ? workbookA.name : "Choose file"}
            </Button>
            <input
              ref={fileInputARef}
              type="file"
              accept=".xlsx"
              onChange={(e) => setWorkbookA(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </div>

          {/* WORKBOOK B DROPZONE */}
          <div className="flex flex-col border-2 border-dashed rounded-lg p-6 text-center border-[var(--card-border)] hover:border-[var(--input-border)]">
            <Upload className="text-secondary w-8 h-8 mx-auto mb-2" />
            <h3 className="text-primary !text-base !font-medium mb-1">Workbook B</h3>
            <p className="text-secondary text-sm mb-4">
              The single-sheet &quot;in&quot; workbook (per-entry food log)
            </p>
            <Button onClick={() => fileInputBRef.current?.click()} className="btn-blue">
              <File className="h-4 w-4" />
              {workbookB ? workbookB.name : "Choose file"}
            </Button>
            <input
              ref={fileInputBRef}
              type="file"
              accept=".xlsx"
              onChange={(e) => setWorkbookB(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex justify-end gap-3">
            <Button onClick={handleClose} className="btn-link">Cancel</Button>
            <Button
              onClick={handleParse}
              className="btn-blue"
              disabled={!workbookA || !workbookB}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2 — PREVIEW */}
      {step === "preview" && preview && (
        <div>

          {/* USER EMAIL */}
          <p className="text-secondary text-sm text-center mb-4">
            Importing for <strong>{preview.user_email}</strong>
          </p>

          {/* WARNING ABOUT WIPE */}
          <div className="alert-yellow mb-4">
            <p className="alert-title">Existing data will be wiped</p>
            <p className="alert-text">
              All seeded foods, entries, weights, notes, programs, targets, and goals for
              your user will be deleted — except any food entries you logged today.
            </p>
          </div>

          {/* STATS GRID */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">

            {/* FOODS */}
            <div className="flex flex-col items-center p-3 rounded-lg border border-[var(--card-border)]">
              <span className="text-2xl font-bold">{preview.foods_count}</span>
              <span className="text-secondary text-xs">Foods</span>
            </div>

            {/* RECIPES */}
            <div className="flex flex-col items-center p-3 rounded-lg border border-[var(--card-border)]">
              <span className="text-2xl font-bold">{preview.recipes_count}</span>
              <span className="text-secondary text-xs">Recipes</span>
            </div>

            {/* ENTRIES */}
            <div className="flex flex-col items-center p-3 rounded-lg border border-[var(--card-border)]">
              <span className="text-2xl font-bold">{preview.entries_count}</span>
              <span className="text-secondary text-xs">Entries</span>
            </div>

            {/* QUICK-ADDS */}
            <div className="flex flex-col items-center p-3 rounded-lg border border-[var(--card-border)]">
              <span className="text-2xl font-bold">{preview.quick_add_entries_count}</span>
              <span className="text-secondary text-xs">Quick-add days</span>
            </div>

            {/* WEIGHTS */}
            <div className="flex flex-col items-center p-3 rounded-lg border border-[var(--card-border)]">
              <span className="text-2xl font-bold">{preview.weights_count}</span>
              <span className="text-secondary text-xs">Weight logs</span>
            </div>

            {/* NOTES */}
            <div className="flex flex-col items-center p-3 rounded-lg border border-[var(--card-border)]">
              <span className="text-2xl font-bold">{preview.day_notes_count}</span>
              <span className="text-secondary text-xs">Day notes</span>
            </div>
          </div>

          {/* TARGET + GOAL */}
          <p className="text-secondary text-sm mb-2">
            Program changes: <strong>{preview.program_history_count}</strong>{" "}
            · Goals: <strong>{preview.goals_count}</strong>
          </p>

          {/* DATE RANGE */}
          {preview.date_range && (
            <p className="text-secondary text-sm mb-4">
              Date range: {preview.date_range.earliest} → {preview.date_range.latest}
            </p>
          )}

          {/* PARSE ERRORS */}
          {preview.errors.length > 0 && (
            <div className="alert-red mb-4">
              <p className="alert-title">{preview.errors.length} parse warnings</p>
              <ul className="alert-text mt-1 text-xs list-disc list-inside max-h-32 overflow-y-auto">
                {preview.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {/* ACTION BUTTONS */}
          <div className="flex justify-end gap-3">
            <Button onClick={() => setStep("upload")} className="btn-link">Back</Button>
            <Button onClick={handleImport} className="btn-red">Wipe &amp; Import</Button>
          </div>
        </div>
      )}

      {/* STEP 3 — PROCESSING */}
      {step === "processing" && (
        <div className="text-center py-12">
          <div className="loading-spinner mx-auto mb-4" />
          <p className="text-page-subtitle">Importing… this can take ~30s</p>
        </div>
      )}

      {/* STEP 3 — RESULTS */}
      {step === "results" && (
        <div>
          {result ? (
            <div>

              {/* SUCCESS HEADER */}
              <div className="text-center py-6">
                <CheckCircle className="icon-green !w-12 !h-12 mx-auto mb-2" />
                <h3 className="text-h1">Import Complete</h3>
              </div>

              {/* WIPE COUNTS */}
              <p className="text-secondary text-sm mb-2"><strong>Wiped:</strong></p>
              <ul className="text-secondary text-sm mb-4 ml-4 list-disc">
                <li>{result.wiped.food_entries} entries · {result.wiped.foods} foods · {result.wiped.food_servings} servings · {result.wiped.food_nutrients} nutrients</li>
                <li>{result.wiped.weight_log} weight logs · {result.wiped.day_notes} day notes</li>
                <li>{result.wiped.macro_targets} targets · {result.wiped.forage_program} programs · {result.wiped.forage_goal} goals</li>
              </ul>

              {/* INSERT COUNTS */}
              <p className="text-secondary text-sm mb-2"><strong>Inserted:</strong></p>
              <ul className="text-secondary text-sm mb-4 ml-4 list-disc">
                <li>{result.inserted.foods} foods · {result.inserted.food_servings} servings · {result.inserted.food_nutrients} nutrients</li>
                <li>{result.inserted.food_entries} entries · {result.inserted.weight_log} weight logs · {result.inserted.day_notes} day notes</li>
                <li>{result.inserted.macro_targets} targets · {result.inserted.forage_goal} goals</li>
              </ul>
            </div>
          ) : (
            <div className="text-center py-8">
              <AlertCircle className="icon-red !w-12 !h-12 mx-auto mb-2" />
              <h3 className="text-h1 mb-4">Import Failed</h3>
              <p className="text-alert-red mb-4">{error}</p>
            </div>
          )}

          {/* CLOSE BUTTON */}
          <div className="flex justify-center">
            <Button onClick={handleClose} className="btn-green">Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
