"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  File,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Exercise } from "../../types/exercise";
import {
  ImportPayload,
  ImportResult,
  ImportPreview,
  NewExerciseInput,
} from "../../types/import";
import { EXERCISE_NAME_ALIASES } from "../../utils/exerciseAliases";
import {
  IMPORT_FIELDS,
  ImportFieldKey,
  ColumnMapping,
  getSmartMappings,
  parseCSV,
  buildPreview,
} from "../../utils/importUtils";

interface ImportHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
}

export default function ImportHistoryModal({
  isOpen,
  onClose,
  onImported,
}: ImportHistoryModalProps) {

  // DATA
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileData, setFileData] = useState<string[][]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);

  // INPUT
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);

  // STATE
  const [isMounted, setIsMounted] = useState(false);
  const [step, setStep] = useState<"upload" | "mapping" | "preview" | "exercise-details" | "processing" | "results">("upload");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedNewExerciseNames, setSelectedNewExerciseNames] = useState<Set<string>>(new Set());
  const [selectedMatchedExerciseNames, setSelectedMatchedExerciseNames] = useState<Set<string>>(new Set());
  const [newExerciseTargetIds, setNewExerciseTargetIds] = useState<Map<string, string>>(new Map());
  const [matchedExerciseTargetIds, setMatchedExerciseTargetIds] = useState<Map<string, string>>(new Map());
  const [exerciseDetailsIndex, setExerciseDetailsIndex] = useState(0);
  const [exerciseDetails, setExerciseDetails] = useState<Map<string, NewExerciseInput>>(new Map());

  // REFS
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetState();
      fetchExercises();
    }
  }, [isOpen]);

  const resetState = () => {
    setStep("upload");
    setFileHeaders([]);
    setFileData([]);
    setPreviewRows([]);
    setColumnMappings([]);
    setPreview(null);
    setResult(null);
    setError(null);
    setSelectedNewExerciseNames(new Set());
    setSelectedMatchedExerciseNames(new Set());
    setNewExerciseTargetIds(new Map());
    setMatchedExerciseTargetIds(new Map());
    setExerciseDetailsIndex(0);
    setExerciseDetails(new Map());
  };

  const fetchExercises = async () => {
    try {
      const response = await fetch("/modules/golem/api/exercises");
      if (!response.ok) throw new Error("Failed to fetch exercises");
      const data = await response.json();
      setExercises(data);
    } catch (error) {
      console.error("Error fetching exercises:", error);
    }
  };

  const buildExerciseMap = (): Map<string, string> => {
    const map = new Map<string, string>();
    for (const exercise of exercises) {
      map.set(exercise.name.toLowerCase(), exercise.id);
    }

    // Add alias entries so alternate exercise names resolve to existing exercises
    for (const [alias, canonical] of Object.entries(EXERCISE_NAME_ALIASES)) {
      const exerciseId = map.get(canonical.toLowerCase());
      if (exerciseId && !map.has(alias.toLowerCase())) {
        map.set(alias.toLowerCase(), exerciseId);
      }
    }

    return map;
  };

  const handleUploadButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = (file: File) => {
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;

        // Parse CSV file
        const parsedData = parseCSV(text);

        if (parsedData.length < 2) {
          toast.error("File must contain at least a header row and one data row");
          return;
        }

        // Extract headers and data rows
        const headers = parsedData[0].map((h) => h.trim());
        const dataRows = parsedData.slice(1);

        setFileHeaders(headers);
        setFileData(dataRows);
        setPreviewRows(dataRows.slice(0, 5));

        // Use the Smart Mapping function to automatically detect and select known headers
        const smartMappings = getSmartMappings(headers);
        setColumnMappings(smartMappings);

        setStep("mapping");
      };
      reader.readAsText(file);
    } catch (error: any) {
      console.error("Error parsing file:", error);
      toast.error(`Error parsing file: ${error.message}`);
    }
  };

  // Used for when a user changes a dropdown, update the column mapping dictionary with the new value
  const updateColumnMapping = (csvColumn: string, dbColumn: ImportFieldKey | null) => {
    setColumnMappings((prev) =>
      prev.map((mapping) =>
        mapping.csvColumn === csvColumn
          ? { ...mapping, dbColumn }
          : mapping
      )
    );
  };

  // Verifies all required fields are mapped and no duplicates are present
  const validateMappings = (): boolean => {
    const requiredFields = IMPORT_FIELDS.filter((field) => field.required);
    const mappedFields = columnMappings.filter((m) => m.dbColumn !== null).map((m) => m.dbColumn);

    for (const field of requiredFields) {
      if (!mappedFields.includes(field.key)) {
        toast.error(
          <span>
            <strong>{field.label}</strong> must be mapped
          </span>
        );
        return false;
      }
    }

    // Check for duplicate mappings
    const dbColumns = columnMappings.filter((m) => m.dbColumn !== null).map((m) => m.dbColumn);
    const uniqueColumns = new Set(dbColumns);
    if (dbColumns.length !== uniqueColumns.size) {
      toast.error("Duplicate columns detected");
      return false;
    }

    // If no required or duplicate errors, pass validation
    return true;
  };

  /**
   * The "Next" button at the Mapping stage will call this function. It will first validate mappings, and if pass,
   * build the preview with parsed sessions, exercises, and validation errors
   */
  const analyzeFileForPreview = () => {
    if (!validateMappings()) return;

    const exerciseMap = buildExerciseMap();
    const parsedPreview = buildPreview(fileData, columnMappings, exerciseMap);
    setPreview(parsedPreview);

    // Initialize exercise review selections - all checked by default
    setSelectedNewExerciseNames(new Set(parsedPreview.new_exercise_names));
    setSelectedMatchedExerciseNames(new Set(parsedPreview.matched_exercise_names));

    // Initialize new exercise mappings - all default to "Create New" (empty string)
    const newTargets = new Map<string, string>();
    parsedPreview.new_exercise_names.forEach(name => newTargets.set(name, ""));
    setNewExerciseTargetIds(newTargets);

    // Initialize matched exercise mappings - pre-populate with auto-matched exercise IDs
    const matchedTargets = new Map<string, string>();
    parsedPreview.matched_exercise_names.forEach(name => {
      const exerciseId = exerciseMap.get(name.toLowerCase());
      if (exerciseId) matchedTargets.set(name, exerciseId);
    });
    setMatchedExerciseTargetIds(matchedTargets);

    setStep("preview");
  };

  // Computes the list of exercise names that will be created (checked + set to "Create New")
  const getExercisesToCreate = (): string[] => {
    if (!preview) return [];
    return preview.new_exercise_names.filter(name =>
      selectedNewExerciseNames.has(name) && !newExerciseTargetIds.get(name)
    );
  };

  // Navigates from Preview to the Exercise Details step (or skips to import if none to create)
  const handlePreviewNext = () => {
    const exercisesToCreate = getExercisesToCreate();

    if (exercisesToCreate.length === 0) {
      handleImport();
      return;
    }

    // Initialize exercise details for each new exercise
    const details = new Map<string, NewExerciseInput>();
    for (const name of exercisesToCreate) {
      const existing = exerciseDetails.get(name);
      if (existing) {
        details.set(name, existing); // preserve any previously entered data
      } else {
        details.set(name, { name, description: null, category: "Strength" });
      }
    }
    setExerciseDetails(details);
    setExerciseDetailsIndex(0);
    setStep("exercise-details");
  };

  // Updates a field on the currently displayed exercise
  const updateCurrentExerciseDetail = (field: keyof NewExerciseInput, value: string | null) => {
    const exercisesToCreate = getExercisesToCreate();
    const currentName = exercisesToCreate[exerciseDetailsIndex];
    if (!currentName) return;

    const newDetails = new Map(exerciseDetails);
    const current = newDetails.get(currentName);
    if (current) {
      newDetails.set(currentName, { ...current, [field]: value });
      setExerciseDetails(newDetails);
    }
  };

  const handleImport = async () => {
    if (!preview) return;

    setStep("processing");
    setError(null);

    // Build set of excluded exercise names (unchecked exercises)
    const excludedExerciseNames = new Set<string>();
    preview.new_exercise_names.forEach(name => {
      if (!selectedNewExerciseNames.has(name)) excludedExerciseNames.add(name);
    });
    preview.matched_exercise_names.forEach(name => {
      if (!selectedMatchedExerciseNames.has(name)) excludedExerciseNames.add(name);
    });

    // Build exercise name remapping (file name → target exercise name)
    const exerciseNameRemapping = new Map<string, string>();

    // New exercises remapped to existing exercises
    newExerciseTargetIds.forEach((targetId, fileName) => {
      if (targetId) {
        const targetExercise = exercises.find(e => e.id === targetId);
        if (targetExercise) exerciseNameRemapping.set(fileName, targetExercise.name);
      }
    });

    // Matched exercises remapped to different exercises
    matchedExerciseTargetIds.forEach((targetId, fileName) => {
      const targetExercise = exercises.find(e => e.id === targetId);
      if (targetExercise && targetExercise.name !== fileName) {
        exerciseNameRemapping.set(fileName, targetExercise.name);
      }
    });

    // New exercises renamed in the exercise details step
    exerciseDetails.forEach((details, originalName) => {
      if (details.name !== originalName) {
        exerciseNameRemapping.set(originalName, details.name);
      }
    });

    // Filter and transform sessions
    const transformedSessions = preview.sessions
      .map(session => ({
        ...session,
        segments: session.segments
          .filter(segment => !excludedExerciseNames.has(segment.exercise_name))
          .map(segment => ({
            ...segment,
            exercise_name: exerciseNameRemapping.get(segment.exercise_name) || segment.exercise_name,
          })),
      }))
      .filter(session => session.segments.length > 0);

    // New exercises to create: checked AND still set to "Create New" (empty target ID)
    const exercisesToCreate = getExercisesToCreate();
    const newExercises: NewExerciseInput[] = exercisesToCreate.map(name => {
      const details = exerciseDetails.get(name);
      return details || { name, description: null, category: "Strength" };
    });

    const payload: ImportPayload = {
      sessions: transformedSessions,
      new_exercises: newExercises,
    };

    try {
      const response = await fetch("/modules/golem/api/sessions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Import failed");
      }

      const importResult: ImportResult = await response.json();
      setResult(importResult);
      setStep("results");
    } catch (error: any) {
      console.error("Error importing workout history:", error);
      setError(error.message || "Import failed");
      setStep("results");
    }
  };

  const handleClose = () => {
    if (result) {
      onImported();
    }
    onClose();
  };

  // Count totals for preview
  const totalSets = preview?.sessions.reduce(
    (total, session) => total + session.segments.reduce(
      (segTotal, segment) => segTotal + segment.sets.length, 0
    ), 0
  ) ?? 0;

  const totalSegments = preview?.sessions.reduce(
    (total, session) => total + session.segments.length, 0
  ) ?? 0;

  const sortedExercises = [...exercises].sort((a, b) => a.name.localeCompare(b.name));

  if (!isMounted || !isOpen) return null;

  return createPortal(

    // BACKDROP
    <div className="modal-backdrop">

      {/* MODAL CARD */}
      <div className="card max-w-[75vw] w-full max-h-[90vh] overflow-y-auto">

        {/* MODAL HEADER */}
        <div className="modal-header">
          <h2 className="text-modal-title">Import Workout History</h2>

          {/* CLOSE BUTTON */}
          <Button
            onClick={handleClose}
            className="btn-link"
            disabled={step === "processing"}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* CONTENT */}
        <div className=" p-6">

          {/* STEP INDICATOR BAR */}
          <div className="flex items-center justify-between mb-8 text-center max-w-2xl mx-auto">

            {/* UPLOAD STEP */}
            <div className={`flex items-center ${step === "upload" ? "text-primary" : "text-muted"}`}>
              <div className={step === "upload" ? "badge-blue" : "badge-gray"}>
                1
              </div>
              <span className="ml-2 font-medium">Upload</span>
            </div>

            {/* ARROW */}
            <ArrowRight className="text-muted w-5 h-5" />

            {/* MAPPING STEP */}
            <div className={`flex items-center ${step === "mapping" ? "text-primary" : "text-muted"}`}>
              <div className={step === "mapping" ? "badge-blue" : "badge-gray"}>
                2
              </div>
              <span className="ml-2 font-medium">Mapping</span>
            </div>

            {/* ARROW */}
            <ArrowRight className="text-muted w-5 h-5" />

            {/* PREVIEW STEP */}
            <div className={`flex items-center ${step === "preview" ? "text-primary" : "text-muted"}`}>
              <div className={step === "preview" ? "badge-blue" : "badge-gray"}>
                3
              </div>
              <span className="ml-2 font-medium">Preview</span>
            </div>

            {/* ARROW */}
            <ArrowRight className="text-muted w-5 h-5" />

            {/* EXERCISES STEP */}
            <div className={`flex items-center ${step === "exercise-details" ? "text-primary" : "text-muted"}`}>
              <div className={step === "exercise-details" ? "badge-blue" : "badge-gray"}>
                4
              </div>
              <span className="ml-2 font-medium">Exercises</span>
            </div>

            {/* ARROW */}
            <ArrowRight className="text-muted w-5 h-5" />

            {/* IMPORT STEP */}
            <div className={`flex items-center ${step === "processing" || step === "results" ? "text-primary" : "text-muted"}`}>
              <div className={step === "processing" || step === "results" ? "badge-blue" : "badge-gray"}>
                5
              </div>
              <span className="ml-2 font-medium">Import</span>
            </div>
          </div>

          {/* STEP 1 - UPLOAD CONTENT */}
          {step === "upload" && (
            <div>

              {/* UPLOAD DROPZONE */}
              <div className="flex flex-col border-2 border-dashed rounded-lg p-8 text-center transition-all border-[var(--card-border)] hover:border-[var(--input-border)]">

                {/* UPLOAD ICON */}
                <Upload className="text-secondary w-12 h-12 mx-auto mb-4" />

                {/* INSTRUCTIONS */}
                <h3 className="text-primary !text-lg !font-medium mb-2">
                  Drop files here
                </h3>

                {/* DESCRIPTION */}
                <p className="text-secondary mb-6">
                  Drag and drop a CSV file or click to browse
                </p>

                {/* BROWSE FILES BUTTON */}
                <Button
                  onClick={handleUploadButtonClick}
                  className="btn-blue"
                >
                  <File className="h-4 w-4" />
                  Browse Files
                </Button>

                {/* HIDDEN FILE INPUT */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {/* STEP 2 - MAPPING CONTENT */}
          {step === "mapping" && (
            <div>

              {/* HEADER */}
              <h3 className="text-card-title !mb-4">Map Columns</h3>

              {/* PREVIEW TABLE */}
              <div className="table-container mb-6">
                <table className="table">

                  {/* TABLE HEADERS MAP */}
                  <thead className="table-header">
                    <tr className="table-header-row">
                      {fileHeaders.map((header, index) => (
                        <th key={index} className="table-header-cell">{header}</th>
                      ))}
                    </tr>
                  </thead>

                  {/* TABLE ROWS */}
                  <tbody className="table-body">

                    {/* RECORDS MAP */}
                    {previewRows.map((row, rowIndex) => (

                      // TABLE ROW
                      <tr key={rowIndex} className="table-row">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="table-cell-compact text-xs">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* COLUMN MAPPING SECTION */}
              <div className="space-y-3 max-w-4xl mx-auto">

                {/* ROWS */}
                {columnMappings.map((mapping, index) => (
                  <div key={index} className="flex items-center gap-4">

                    {/* COLUMN FROM FILE TEXT */}
                    <div className="text-primary flex-1">
                      {mapping.csvColumn}
                    </div>

                    {/* ARROW */}
                    <ArrowRight className="text-muted w-5 h-5" />

                    {/* DROPDOWN */}
                    <div className="flex-1">
                      <select
                        value={mapping.dbColumn || ""}
                        onChange={(e) => updateColumnMapping(mapping.csvColumn, (e.target.value || null) as ImportFieldKey | null)}
                        className="dropdown-field"
                      >
                        <option value="">-- Skip --</option>
                        {IMPORT_FIELDS.map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label}{field.required ? " *" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              {/* ACTION BUTTONS GROUP */}
              <div className="mt-6 flex justify-end gap-3">

                {/* BACK BUTTON */}
                <Button
                  onClick={() => setStep("upload")}
                  className="btn-link"
                >
                  Back
                </Button>

                {/* NEXT BUTTON */}
                <Button
                  onClick={analyzeFileForPreview}
                  className="btn-blue"
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3 - PREVIEW CONTENT */}
          {step === "preview" && preview && (

            // CONTENT
            <div>

              {/* NO DATA PLACEHOLDER */}
              {preview.sessions.length === 0 && (
                <div className="text-center py-8">
                  <AlertCircle className="icon-red !w-16 !h-16 mx-auto mb-4" />
                  <h3 className="text-h1 mb-4">
                    No Valid Data
                  </h3>
                  <p className="text-secondary mb-4">
                    No valid sessions could be parsed from the file.
                  </p>

                  {/* VALIDATION ERRORS */}
                  {preview.errors.length > 0 && (
                    <div className="alert-red mb-4 text-left">
                      <p className="font-medium">{preview.errors.length} row{preview.errors.length > 1 ? "s" : ""} skipped:</p>
                      <ul className="mt-1 text-sm list-disc list-inside max-h-32 overflow-y-auto">
                        {preview.errors.map((validationError, index) => (
                          <li key={index}>Row {validationError.row}: {validationError.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* BACK BUTTON */}
                  <div className="mt-6 flex justify-center">
                    <Button
                      onClick={() => setStep("mapping")}
                      className="btn-link"
                    >
                      Back
                    </Button>
                  </div>
                </div>
              )}

              {/* PREVIEW DATA */}
              {preview.sessions.length > 0 && (
                <>

                  {/* TITLE */}
                  <h3 className="text-card-title !mb-4">Review Import</h3>

                  {/* SUMMARY STATS */}
                  <div className="flex gap-4 flex-wrap mb-6">

                    {/* SESSIONS COUNT */}
                    <div className="flex flex-col items-center p-3 rounded-lg flex-1 min-w-[100px] border border-[var(--card-border)]">
                      <span className="text-2xl font-bold">{preview.sessions.length}</span>
                      <span className="text-secondary text-sm">Sessions</span>
                    </div>

                    {/* SEGMENTS COUNT */}
                    <div className="flex flex-col items-center p-3 rounded-lg flex-1 min-w-[100px] border border-[var(--card-border)]">
                      <span className="text-2xl font-bold">{totalSegments}</span>
                      <span className="text-secondary text-sm">Exercises</span>
                    </div>

                    {/* SETS COUNT */}
                    <div className="flex flex-col items-center p-3 rounded-lg flex-1 min-w-[100px] border border-[var(--card-border)]">
                      <span className="text-2xl font-bold">{totalSets}</span>
                      <span className="text-secondary text-sm">Sets</span>
                    </div>
                  </div>

                  {/* NEW EXERCISES SECTION */}
                  {preview.new_exercise_names.length > 0 && (
                    <div className="mb-6">

                      {/* SECTION HEADER */}
                      <div>

                        {/* SECTION TITLE */}
                        <h4 className="text-alert-green">
                          New Exercises ({preview.new_exercise_names.length})
                        </h4>

                        {/* SUBHEADER */}
                        <div className="flex items-center justify-between mb-2">

                          {/* SUBTITLE */}
                          <p className="text-secondary italic">Selected exercises will be created</p>
                        </div>
                      </div>

                      {/* NEW EXERCISES TABLE */}
                      <div className="table-container">
                        <table className="table">

                          {/* TABLE HEADER */}
                          <thead className="table-header sticky top-0">
                            <tr className="table-header-row">
                              <th className="table-header-cell">

                                {/* SELECT ALL CHECKBOX */}
                                <input
                                  type="checkbox"
                                  checked={preview.new_exercise_names.length > 0 && selectedNewExerciseNames.size === preview.new_exercise_names.length}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedNewExerciseNames(new Set(preview.new_exercise_names));
                                    } else {
                                      setSelectedNewExerciseNames(new Set());
                                    }
                                  }}
                                  className="checkbox"
                                />
                              </th>
                              <th className="table-header-cell">Exercise Name</th>
                              <th className="table-header-cell">Map To</th>
                            </tr>
                          </thead>

                          {/* TABLE ROWS */}
                          <tbody className="table-body">

                            {/* RECORDS MAP */}
                            {preview.new_exercise_names.map((name) => (

                              // TABLE ROW
                              <tr key={name} className="table-row">

                                {/* SELECT CHECKBOX CELL */}
                                <td className="table-cell">
                                  <input
                                    type="checkbox"
                                    checked={selectedNewExerciseNames.has(name)}
                                    onChange={(e) => {
                                      const newSet = new Set(selectedNewExerciseNames);
                                      if (e.target.checked) {
                                        newSet.add(name);
                                      } else {
                                        newSet.delete(name);
                                      }
                                      setSelectedNewExerciseNames(newSet);
                                    }}
                                    className="checkbox"
                                  />
                                </td>

                                {/* EXERCISE NAME CELL */}
                                <td className="table-cell">{name}</td>

                                {/* MAP TO DROPDOWN CELL */}
                                <td className="table-cell">
                                  <select
                                    value={newExerciseTargetIds.get(name) || ""}
                                    onChange={(e) => {
                                      const newMap = new Map(newExerciseTargetIds);
                                      newMap.set(name, e.target.value);
                                      setNewExerciseTargetIds(newMap);
                                    }}
                                    className="dropdown-field"
                                  >
                                    <option value="">-- Create New --</option>
                                    {sortedExercises.map((exercise) => (
                                      <option key={exercise.id} value={exercise.id}>
                                        {exercise.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* MATCHED EXERCISES SECTION */}
                  {preview.matched_exercise_names.length > 0 && (
                    <div className="mb-6">

                      {/* SECTION HEADER */}
                      <div>

                        {/* SECTION TITLE */}
                        <h4 className="text-alert-blue">
                          Matched Exercises ({preview.matched_exercise_names.length})
                        </h4>

                        {/* SUBHEADER */}
                        <div className="flex items-center justify-between mb-2">

                          {/* SUBTITLE */}
                          <p className="text-secondary italic">Selected exercises will be imported</p>
                        </div>
                      </div>

                      {/* MATCHED EXERCISES TABLE */}
                      <div className="table-container">
                        <table className="table">

                          {/* TABLE HEADER */}
                          <thead className="table-header sticky top-0">
                            <tr className="table-header-row">
                              <th className="table-header-cell">

                                {/* SELECT ALL CHECKBOX */}
                                <input
                                  type="checkbox"
                                  checked={preview.matched_exercise_names.length > 0 && selectedMatchedExerciseNames.size === preview.matched_exercise_names.length}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedMatchedExerciseNames(new Set(preview.matched_exercise_names));
                                    } else {
                                      setSelectedMatchedExerciseNames(new Set());
                                    }
                                  }}
                                  className="checkbox"
                                />
                              </th>
                              <th className="table-header-cell">Exercise Name</th>
                              <th className="table-header-cell">Mapped To</th>
                            </tr>
                          </thead>

                          {/* TABLE ROWS */}
                          <tbody className="table-body">

                            {/* RECORDS MAP */}
                            {preview.matched_exercise_names.map((name) => (

                              // TABLE ROW
                              <tr key={name} className="table-row">

                                {/* SELECT CHECKBOX CELL */}
                                <td className="table-cell">
                                  <input
                                    type="checkbox"
                                    checked={selectedMatchedExerciseNames.has(name)}
                                    onChange={(e) => {
                                      const newSet = new Set(selectedMatchedExerciseNames);
                                      if (e.target.checked) {
                                        newSet.add(name);
                                      } else {
                                        newSet.delete(name);
                                      }
                                      setSelectedMatchedExerciseNames(newSet);
                                    }}
                                    className="checkbox"
                                  />
                                </td>

                                {/* EXERCISE NAME CELL */}
                                <td className="table-cell">{name}</td>

                                {/* MAPPED TO DROPDOWN CELL */}
                                <td className="table-cell">
                                  <select
                                    value={matchedExerciseTargetIds.get(name) || ""}
                                    onChange={(e) => {
                                      const newMap = new Map(matchedExerciseTargetIds);
                                      newMap.set(name, e.target.value);
                                      setMatchedExerciseTargetIds(newMap);
                                    }}
                                    className="dropdown-field"
                                  >
                                    {sortedExercises.map((exercise) => (
                                      <option key={exercise.id} value={exercise.id}>
                                        {exercise.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* VALIDATION ERRORS */}
                  {preview.errors.length > 0 && (
                    <div className="alert-red mb-4">
                      <p className="font-medium">{preview.errors.length} row{preview.errors.length > 1 ? "s" : ""} skipped:</p>
                      <ul className="mt-1 text-sm list-disc list-inside max-h-32 overflow-y-auto">
                        {preview.errors.map((validationError, index) => (
                          <li key={index}>Row {validationError.row}: {validationError.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* DATE RANGE */}
                  <p className="text-secondary text-sm mb-4">
                    Date range: {preview.sessions[0].started_at} to {preview.sessions[preview.sessions.length - 1].started_at}
                  </p>

                  {/* ACTION BUTTONS GROUP */}
                  <div className="mt-6 flex justify-end gap-3">

                    {/* BACK BUTTON */}
                    <Button
                      onClick={() => setStep("mapping")}
                      className="btn-link"
                    >
                      Back
                    </Button>

                    {/* NEXT BUTTON */}
                    <Button
                      onClick={handlePreviewNext}
                      className="btn-blue"
                      disabled={
                        selectedNewExerciseNames.size === 0 &&
                        selectedMatchedExerciseNames.size === 0
                      }
                    >
                      Next
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 4 - EXERCISE DETAILS */}
          {step === "exercise-details" && (() => {
            const exercisesToCreate = getExercisesToCreate();
            const currentName = exercisesToCreate[exerciseDetailsIndex];
            const currentDetails = currentName ? exerciseDetails.get(currentName) : null;

            return (
              <div>

                {/* HEADER */}
                <h3 className="text-card-title !mb-4">New Exercises</h3>

                {/* NAVIGATION */}
                <div className="flex items-center justify-center gap-4 mb-6">

                  {/* PREVIOUS BUTTON */}
                  <Button
                    onClick={() => setExerciseDetailsIndex(exerciseDetailsIndex - 1)}
                    disabled={exerciseDetailsIndex === 0}
                    className="btn-link"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>

                  {/* COUNTER */}
                  <span className="text-primary font-medium">
                    {exerciseDetailsIndex + 1} of {exercisesToCreate.length}
                  </span>

                  {/* NEXT BUTTON */}
                  <Button
                    onClick={() => setExerciseDetailsIndex(exerciseDetailsIndex + 1)}
                    disabled={exerciseDetailsIndex === exercisesToCreate.length - 1}
                    className="btn-link"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </div>

                {/* EXERCISE FORM */}
                {currentDetails && (
                  <div className="max-w-lg mx-auto space-y-4">

                    {/* NAME INPUT */}
                    <div className="flex flex-col gap-1">
                      <label className="text-label">Name</label>
                      <input
                        type="text"
                        value={currentDetails.name}
                        onChange={(e) => updateCurrentExerciseDetail("name", e.target.value)}
                        className="input-field"
                      />
                    </div>

                    {/* DESCRIPTION INPUT */}
                    <div className="flex flex-col gap-1">
                      <label className="text-label">Description</label>
                      <textarea
                        value={currentDetails.description || ""}
                        onChange={(e) => updateCurrentExerciseDetail("description", e.target.value || null)}
                        placeholder="Optional description..."
                        className="input-field min-h-[80px] resize-y"
                        rows={3}
                      />
                    </div>

                    {/* CATEGORY SELECT */}
                    <div className="flex flex-col gap-1">
                      <label className="text-label">Category</label>
                      <select
                        value={currentDetails.category}
                        onChange={(e) => updateCurrentExerciseDetail("category", e.target.value)}
                        className="input-field"
                      >
                        <option value="Strength">Strength</option>
                        <option value="Cardio">Cardio</option>
                        <option value="Mobility">Mobility</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* ACTION BUTTONS GROUP */}
                <div className="mt-6 flex justify-end gap-3">

                  {/* BACK BUTTON */}
                  <Button
                    onClick={() => setStep("preview")}
                    className="btn-link"
                  >
                    Back
                  </Button>

                  {/* IMPORT BUTTON */}
                  <Button
                    onClick={handleImport}
                    className="btn-green"
                  >
                    Import
                  </Button>
                </div>
              </div>
            );
          })()}

          {/* STEP 5 - PROCESSING */}
          {step === "processing" && (
            <div className="text-center py-12">
              <p className="text-page-subtitle">Processing...</p>
            </div>
          )}

          {/* STEP 5.1 - RESULTS */}
          {step === "results" && (
            <div>
              {result ? (
                <div>

                  {/* SUCCESS HEADER */}
                  <div className="text-center py-8">
                    <CheckCircle className="icon-green !w-16 !h-16 mx-auto mb-4" />
                    <h3 className="text-h1 mb-4">
                      Import Complete!
                    </h3>
                  </div>

                  {/* RESULT STATS */}
                  <div className="flex gap-4 flex-wrap mb-4">

                    {/* SESSIONS CREATED */}
                    <div className="flex flex-col items-center p-3 rounded-lg flex-1 min-w-[100px] border border-[var(--card-border)]">
                      <span className="text-2xl font-bold">{result.sessions_created}</span>
                      <span className="text-secondary text-sm">Sessions</span>
                    </div>

                    {/* SEGMENTS CREATED */}
                    <div className="flex flex-col items-center p-3 rounded-lg flex-1 min-w-[100px] border border-[var(--card-border)]">
                      <span className="text-2xl font-bold">{result.segments_created}</span>
                      <span className="text-secondary text-sm">Exercises</span>
                    </div>

                    {/* SETS CREATED */}
                    <div className="flex flex-col items-center p-3 rounded-lg flex-1 min-w-[100px] border border-[var(--card-border)]">
                      <span className="text-2xl font-bold">{result.sets_created}</span>
                      <span className="text-secondary text-sm">Sets</span>
                    </div>
                  </div>

                  {/* EXERCISES CREATED NOTE */}
                  {result.exercises_created > 0 && (
                    <p className="text-secondary text-sm text-center mb-4">
                      {result.exercises_created} new exercise{result.exercises_created > 1 ? "s" : ""} created
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="icon-red !w-16 !h-16 mx-auto mb-4" />
                  <h3 className="text-h1 mb-4">
                    Import Failed
                  </h3>
                  <p className="text-alert-red mb-4">{error}</p>
                </div>
              )}

              {/* CLOSE BUTTON */}
              <div className="mt-6 flex justify-center">
                <Button
                  onClick={handleClose}
                  className="btn-green"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
