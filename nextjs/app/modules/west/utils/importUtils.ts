import {
  ImportPreview,
  ImportSession,
  ImportSegment,
  ImportValidationError,
} from "../types/import";
import { formatSessionName } from "./format";

// Import field definitions for column mapping
export const IMPORT_FIELDS = [
  { key: "date", label: "Date", required: true },
  { key: "exercise", label: "Exercise", required: true },
  { key: "weight_lb", label: "Weight (lb)", required: false },
  { key: "reps", label: "Reps", required: true },
  { key: "rpe", label: "RPE", required: false },
  { key: "is_warmup", label: "Is Warmup", required: false },
] as const;

export type ImportFieldKey = typeof IMPORT_FIELDS[number]["key"];

export interface ColumnMapping {
  csvColumn: string;
  dbColumn: ImportFieldKey | null;
}

// Smart mapping keywords for auto-detecting column headers
const SMART_MAPPING: Record<ImportFieldKey, string[]> = {
  date: ["date"],
  exercise: ["exercise", "movement", "lift"],
  weight_lb: ["weight", "load", "lbs", "lb"],
  reps: ["reps", "rep", "repetitions"],
  rpe: ["rpe"],
  is_warmup: ["warmup", "warm_up", "warm-up", "is_warmup"],
};

export function getSmartMappings(fileHeaders: string[]): ColumnMapping[] {
  const usedFields = new Set<ImportFieldKey>();

  return fileHeaders.map((header) => {
    const headerLower = header.toLowerCase().trim();

    // Find the first matching field that hasn't been used yet
    for (const [fieldKey, keywords] of Object.entries(SMART_MAPPING)) {
      if (usedFields.has(fieldKey as ImportFieldKey)) continue;
      if (keywords.some((keyword) => headerLower.includes(keyword))) {
        usedFields.add(fieldKey as ImportFieldKey);
        return { csvColumn: header, dbColumn: fieldKey as ImportFieldKey };
      }
    }

    return { csvColumn: header, dbColumn: null };
  });
}

export function parseCSV(text: string): string[][] {
  const lines = text.split("\n").filter((line) => line.trim());
  return lines.map((line) => {
    const fields: string[] = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        // Quoted field — handle escaped quotes (doubled "")
        let value = "";
        i++;
        while (i < line.length) {
          if (line[i] === '"') {
            if (i + 1 < line.length && line[i + 1] === '"') {
              value += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            value += line[i];
            i++;
          }
        }
        fields.push(value.trim());
        if (i < line.length && line[i] === ",") i++;
      } else {
        // Unquoted field
        let end = line.indexOf(",", i);
        if (end === -1) end = line.length;
        fields.push(line.substring(i, end).trim());
        i = end + 1;
      }
    }
    return fields;
  });
}

interface ParsedRow {
  rowNumber: number;
  date: Date;
  dateString: string;
  exerciseName: string;
  weight: number;
  reps: number;
  rpe: number | null;
  isWarmup: boolean;
}

export function buildPreview(
  dataRows: string[][],
  columnMappings: ColumnMapping[],
  exerciseNameToId: Map<string, string>
): ImportPreview {
  const errors: ImportValidationError[] = [];

  // Build field → column index lookup from mappings
  const fieldIndex: Partial<Record<ImportFieldKey, number>> = {};
  columnMappings.forEach((mapping, index) => {
    if (mapping.dbColumn) {
      fieldIndex[mapping.dbColumn] = index;
    }
  });

  const parsedRows: ParsedRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2; // +2 for 1-indexed and header row
    const row = dataRows[i];

    // Read values using mapped column indices
    const dateStr = fieldIndex.date !== undefined ? row[fieldIndex.date] : undefined;
    const exerciseName = fieldIndex.exercise !== undefined ? row[fieldIndex.exercise] : undefined;
    const weightStr = fieldIndex.weight_lb !== undefined ? row[fieldIndex.weight_lb] : undefined;
    const repsStr = fieldIndex.reps !== undefined ? row[fieldIndex.reps] : undefined;
    const rpeStr = fieldIndex.rpe !== undefined ? row[fieldIndex.rpe] : undefined;
    const isWarmupStr = fieldIndex.is_warmup !== undefined ? row[fieldIndex.is_warmup] : undefined;

    // Validate date
    const dateParts = dateStr?.trim().split("/");
    if (!dateParts || dateParts.length !== 3) {
      errors.push({ row: rowNumber, field: "date", message: `Invalid date: '${dateStr}'` });
      continue;
    }
    const month = parseInt(dateParts[0]) - 1;
    const day = parseInt(dateParts[1]);
    const year = parseInt(dateParts[2]);
    const date = new Date(year, month, day);
    if (isNaN(date.getTime())) {
      errors.push({ row: rowNumber, field: "date", message: `Invalid date: '${dateStr}'` });
      continue;
    }

    // Validate exercise name
    if (!exerciseName?.trim()) {
      errors.push({ row: rowNumber, field: "exercise", message: "Exercise name is empty" });
      continue;
    }

    // Parse weight (0 or empty = bodyweight)
    const weightTrimmed = weightStr?.trim();
    const weight = weightTrimmed ? parseFloat(weightTrimmed) : 0;
    if (isNaN(weight)) {
      errors.push({ row: rowNumber, field: "weight_lb", message: `Invalid weight: '${weightStr}'` });
      continue;
    }

    // Validate reps
    const reps = parseInt(repsStr?.trim() || "");
    if (isNaN(reps) || reps <= 0) {
      errors.push({ row: rowNumber, field: "reps", message: `Invalid reps: '${repsStr}'` });
      continue;
    }

    // Parse optional RPE
    const rpeTrimmed = rpeStr?.trim();
    const rpe = rpeTrimmed ? parseFloat(rpeTrimmed) : null;
    if (rpe !== null && isNaN(rpe)) {
      errors.push({ row: rowNumber, field: "rpe", message: `Invalid RPE: '${rpeStr}'` });
      continue;
    }

    // Parse is_warmup (default to working if absent)
    const isWarmup = isWarmupStr?.trim().toUpperCase() === "TRUE";

    // Use ISO date string as grouping key for consistent date grouping
    const dateString = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    parsedRows.push({
      rowNumber,
      date,
      dateString,
      exerciseName: exerciseName.trim(),
      weight,
      reps,
      rpe,
      isWarmup,
    });
  }

  // Group rows by date → sessions
  const dateGroups = new Map<string, ParsedRow[]>();
  for (const row of parsedRows) {
    if (!dateGroups.has(row.dateString)) {
      dateGroups.set(row.dateString, []);
    }
    dateGroups.get(row.dateString)!.push(row);
  }

  // Build sessions
  const sessions: ImportSession[] = [];
  const newExerciseNames = new Set<string>();
  const matchedExerciseNames = new Set<string>();

  // Sort dates chronologically
  const sortedDates = Array.from(dateGroups.keys()).sort();

  for (const dateString of sortedDates) {
    const rows = dateGroups.get(dateString)!;
    const sessionDate = rows[0].date;

    // Group consecutive rows with same exercise name AND same is_warmup into segments
    const segments: ImportSegment[] = [];
    let warmupOrderIndex = 0;
    let workingOrderIndex = 0;

    let currentSegment: ImportSegment | null = null;

    for (const row of rows) {

      // Track matched vs new exercises
      if (exerciseNameToId.has(row.exerciseName.toLowerCase())) {
        matchedExerciseNames.add(row.exerciseName);
      } else {
        newExerciseNames.add(row.exerciseName);
      }

      // Check if this row continues the current segment
      const continuesSegment =
        currentSegment &&
        currentSegment.exercise_name === row.exerciseName &&
        currentSegment.is_warmup === row.isWarmup;

      if (continuesSegment && currentSegment) {
        // Add set to current segment
        currentSegment.sets.push({
          set_number: currentSegment.sets.length + 1,
          is_warmup: row.isWarmup,
          reps: row.reps,
          weight: row.weight,
          rpe: row.rpe,
        });
      } else {
        // Start a new segment
        const orderIndex = row.isWarmup ? warmupOrderIndex++ : workingOrderIndex++;
        const exerciseId = exerciseNameToId.get(row.exerciseName.toLowerCase()) ?? null;

        currentSegment = {
          exercise_name: row.exerciseName,
          exercise_id: exerciseId,
          order_index: orderIndex,
          is_warmup: row.isWarmup,
          sets: [
            {
              set_number: 1,
              is_warmup: row.isWarmup,
              reps: row.reps,
              weight: row.weight,
              rpe: row.rpe,
            },
          ],
        };
        segments.push(currentSegment);
      }
    }

    sessions.push({
      name: formatSessionName(sessionDate),
      started_at: dateString,
      segments,
    });
  }

  return {
    sessions,
    new_exercise_names: Array.from(newExerciseNames),
    matched_exercise_names: Array.from(matchedExerciseNames),
    errors,
  };
}
