import { CARD_CATEGORY_MAX } from "../types/card";

// CSV import for a deck's cards. Modelled on golem's history import
// (app/modules/golem/utils/importUtils.ts + ui/history/ImportHistoryModal.tsx): same
// upload → map columns → preview → import flow, the same smart-mapping-by-keyword step,
// and the same ColumnMapping shape, so the two importers read alike.
//
// The one deliberate divergence is the parser. Golem's splits the file on newlines before
// parsing fields, which is fine for its rows (a date, a lift, some numbers) but wrong here:
// a card's front, back or notes is markdown and routinely contains newlines, which a
// spec-conformant CSV writer emits inside a quoted field. Splitting first would tear one
// card into several broken rows. The parser below walks the text once instead, so a quoted
// newline stays inside its field.

// The card fields a CSV column can be mapped onto. `front` is the only required one — a
// question set is often imported ahead of its answers, and the card model allows a blank
// back.
export const IMPORT_FIELDS = [
  { key: "front", label: "Front (question)", required: true },
  { key: "back", label: "Back (answer)", required: false },
  { key: "notes", label: "Notes", required: false },
  { key: "category", label: "Category", required: false },
  { key: "is_draft", label: "Draft", required: false },
] as const;

export type ImportFieldKey = typeof IMPORT_FIELDS[number]["key"];

export interface ColumnMapping {
  csvColumn: string;
  cardField: ImportFieldKey | null;
}

// Header names each field answers to. Ordered so the most specific wins: "front" is checked
// before "back" would ever see it, and each field is claimed at most once.
const SMART_MAPPING: Record<ImportFieldKey, string[]> = {
  front: ["front", "question", "term", "prompt", "q"],
  back: ["back", "answer", "definition", "a"],
  notes: ["note", "notes", "comment", "extra"],
  category: ["category", "tag", "topic", "deck", "chapter", "section"],
  is_draft: ["draft", "is_draft"],
};

// Maps a file's headers onto card fields by name. Anything unrecognised comes back
// unmapped rather than guessed at — the user assigns it (or leaves it out) in the mapping
// step, which is also where a mis-guess gets corrected.
export function getSmartMappings(fileHeaders: string[]): ColumnMapping[] {
  const used = new Set<ImportFieldKey>();

  return fileHeaders.map((header) => {
    const headerLower = header.toLowerCase().trim();

    for (const [fieldKey, keywords] of Object.entries(SMART_MAPPING) as [ImportFieldKey, string[]][]) {
      if (used.has(fieldKey)) continue;
      // Whole-word-ish: a header of "a" should map to back, but "category" must not match
      // it. Exact match first, then containment for the multi-character keywords.
      const hit = keywords.some((keyword) =>
        keyword.length <= 2 ? headerLower === keyword : headerLower.includes(keyword)
      );
      if (hit) {
        used.add(fieldKey);
        return { csvColumn: header, cardField: fieldKey };
      }
    }

    return { csvColumn: header, cardField: null };
  });
}

// Parses CSV text into rows of fields, per RFC 4180: fields may be quoted, a doubled quote
// inside a quoted field is a literal quote, and a newline inside a quoted field belongs to
// the field. Handles CRLF, LF and a trailing newline. Whitespace is preserved inside quoted
// fields (a card's markdown indentation is meaningful) and trimmed on bare ones.
export function parseCSV(text: string): string[][] {
  // A UTF-8 BOM survives Excel's "Save as CSV" and would otherwise become part of the first
  // header name, so the first column silently fails to map.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let fieldWasQuoted = false;
  let i = 0;

  const endField = () => {
    row.push(fieldWasQuoted ? field : field.trim());
    field = "";
    fieldWasQuoted = false;
  };
  const endRow = () => {
    endField();
    // A blank trailing line isn't a row of one empty card.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') { quoted = true; fieldWasQuoted = true; i++; continue; }
    if (char === ",") { endField(); i++; continue; }
    if (char === "\r") { i++; continue; }
    if (char === "\n") { endRow(); i++; continue; }

    field += char;
    i++;
  }

  // Whatever is left after the last delimiter is the final row (files often lack a trailing
  // newline).
  if (field !== "" || fieldWasQuoted || row.length > 0) endRow();

  return rows;
}

// A row as it would be written, plus why it wouldn't be.
export interface ImportRow {
  rowNumber: number; // 1-based, counting the header as row 1, so it matches the file
  front: string;
  back: string;
  notes: string | null;
  category: string | null;
  isDraft: boolean;
  error: string | null;
}

export interface ImportPreview {
  rows: ImportRow[];
  valid: ImportRow[];
  skipped: ImportRow[];
}

// Values a "draft" column can carry. Anything else — including an empty cell — is not a
// draft, which is the safe default: a card wrongly marked draft is silently held out of
// study, whereas a card wrongly published is visible and fixable.
const TRUTHY = new Set(["1", "true", "yes", "y", "t", "draft"]);

// Turns the mapped file into the rows an import would write, each carrying its own reason
// for being skipped. Nothing is thrown: the preview's job is to show the user which rows
// won't make it and let them decide whether to fix the file or import the rest.
export function buildImportPreview(dataRows: string[][], mappings: ColumnMapping[]): ImportPreview {
  const indexOf = (field: ImportFieldKey) => mappings.findIndex((m) => m.cardField === field);
  const frontIndex = indexOf("front");
  const backIndex = indexOf("back");
  const notesIndex = indexOf("notes");
  const categoryIndex = indexOf("category");
  const draftIndex = indexOf("is_draft");

  const at = (row: string[], index: number) => (index >= 0 ? (row[index] ?? "") : "");

  const rows: ImportRow[] = dataRows.map((row, i) => {
    const front = at(row, frontIndex).trim();
    const category = at(row, categoryIndex).trim();

    let error: string | null = null;
    if (!front) error = "No front — a card needs a question";
    else if (category.length > CARD_CATEGORY_MAX) error = `Category is longer than ${CARD_CATEGORY_MAX} characters`;

    return {
      rowNumber: i + 2, // +1 for zero-based, +1 for the header row
      front,
      back: at(row, backIndex).trim(),
      notes: at(row, notesIndex).trim() || null,
      category: category || null,
      isDraft: TRUTHY.has(at(row, draftIndex).trim().toLowerCase()),
      error,
    };
  });

  return {
    rows,
    valid: rows.filter((r) => !r.error),
    skipped: rows.filter((r) => r.error),
  };
}
