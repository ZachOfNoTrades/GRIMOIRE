"use client";

import { useRef, useState } from "react";
import { Upload, File as FileIcon, AlertTriangle, Check } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import {
  IMPORT_FIELDS,
  ImportFieldKey,
  ColumnMapping,
  ImportPreview,
  buildImportPreview,
  getSmartMappings,
  parseCSV,
} from "../../../utils/importUtils";

// How many cards go in one request. Each insert renumbers the deck's order indexes behind
// it, so a thousand-row file in a single transaction would hold a lock for a long time and
// give the user no sign of progress. Chunking trades all-or-nothing for a progress count
// and a partial result the user can see — the same trade golem's history import makes.
const CHUNK_SIZE = 100;

// Rows of the file shown in the mapping step, so the user can see what they're mapping.
const PREVIEW_ROWS = 5;

interface ImportCardsModalProps {
  isOpen: boolean;
  deckId: string;
  onClose: () => void;
  // Fired after a successful import so the deck page can refetch its cards.
  onImported: () => void;
}

type Step = "upload" | "mapping" | "preview" | "importing" | "results";

export default function ImportCardsModal({ isOpen, deckId, onClose, onImported }: ImportCardsModalProps) {
  // DATA
  const [fileName, setFileName] = useState<string>("");
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileData, setFileData] = useState<string[][]>([]);

  // INPUT
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);

  // STATE
  const [step, setStep] = useState<Step>("upload");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Which fields the current mapping covers — front has to be one of them before the
  // import can go anywhere, since a card without a question isn't a card.
  const mappedFields = new Set(columnMappings.map((m) => m.cardField).filter(Boolean) as ImportFieldKey[]);
  const hasFront = mappedFields.has("front");

  const reset = () => {
    setFileName("");
    setFileHeaders([]);
    setFileData([]);
    setColumnMappings([]);
    setPreview(null);
    setImportedCount(0);
    setFailedMessage(null);
    setStep("upload");
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onerror = () => toast.error("Couldn't read that file");
    reader.onload = (event) => {
      const text = (event.target?.result as string) ?? "";
      const parsed = parseCSV(text);

      if (parsed.length < 2) {
        toast.error("That file needs a header row and at least one card");
        return;
      }

      const headers = parsed[0].map((h) => h.trim());
      const dataRows = parsed.slice(1);
      setFileName(file.name);
      setFileHeaders(headers);
      setFileData(dataRows);
      setColumnMappings(getSmartMappings(headers));
      setStep("mapping");
    };
    reader.readAsText(file);
  };

  // One column's target field. Assigning a field that another column already claims moves
  // it, rather than silently writing two columns into one card field.
  const setMapping = (csvColumn: string, cardField: ImportFieldKey | null) => {
    setColumnMappings((prev) =>
      prev.map((mapping) => {
        if (mapping.csvColumn === csvColumn) return { ...mapping, cardField };
        if (cardField !== null && mapping.cardField === cardField) return { ...mapping, cardField: null };
        return mapping;
      })
    );
  };

  const goToPreview = () => {
    setPreview(buildImportPreview(fileData, columnMappings));
    setStep("preview");
  };

  // Writes the valid rows, in file order, appended to the end of the deck. Reuses the card
  // table's own bulk-save endpoint (PATCH with a `create` list) rather than adding a second
  // create path — it already inserts a batch inside one transaction and positions each row.
  const runImport = async () => {
    if (!preview || preview.valid.length === 0) return;
    setStep("importing");
    setImportedCount(0);
    setFailedMessage(null);

    const rows = preview.valid;
    for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
      const chunk = rows.slice(start, start + CHUNK_SIZE);
      try {
        const response = await fetch(`/modules/rune/api/decks/${deckId}/cards`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cards: [],
            create: chunk.map((row) => ({
              front: row.front,
              back: row.back,
              notes: row.notes,
              category: row.category,
              is_draft: row.isDraft,
              // No anchor — imported cards go on the end of the deck, in file order.
              after_card_id: null,
            })),
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Request failed");
        }
        setImportedCount((count) => count + chunk.length);
      } catch (error) {
        console.error("Error importing cards:", error);
        // Say how far it got: earlier chunks are already in the deck, and re-running the
        // whole file would duplicate them.
        setFailedMessage(
          error instanceof Error && error.message !== "Request failed"
            ? error.message
            : "The import stopped partway through"
        );
        break;
      }
    }

    setStep("results");
    onImported();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      disableClose={step === "importing"}
      wide
      tall
      title="Import cards from CSV"
      subHeader={fileName ? <span className="text-subtle">{fileName}</span> : undefined}
      footer={
        <div className="flex gap-2 justify-end">
          {/* BACK BUTTON — only where there is a step to go back to */}
          {(step === "mapping" || step === "preview") && (
            <Button
              className="btn-off"
              onClick={() => (step === "preview" ? setStep("mapping") : reset())}
            >
              Back
            </Button>
          )}

          {/* PRIMARY BUTTON — named for what it does at this step */}
          {step === "mapping" && (
            <Button
              className="btn-blue"
              onClick={goToPreview}
              disabled={!hasFront}
              title={hasFront ? undefined : "Map one column to Front first — a card needs a question"}
            >
              Check the cards
            </Button>
          )}

          {step === "preview" && (
            <Button className="btn-blue" onClick={runImport} disabled={!preview || preview.valid.length === 0}>
              Import {preview?.valid.length ?? 0} {preview?.valid.length === 1 ? "card" : "cards"}
            </Button>
          )}

          {(step === "upload" || step === "results") && (
            <Button className="btn-off" onClick={close}>
              {step === "results" ? "Done" : "Cancel"}
            </Button>
          )}
        </div>
      }
    >
      {/* STEP 1 — CHOOSE A FILE */}
      {step === "upload" && (
        <div>

          {/* DROPZONE */}
          <div
            className="rune-import-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
          >

            {/* ICON */}
            <Upload className="text-secondary w-10 h-10 mx-auto mb-3" aria-hidden="true" />

            {/* INSTRUCTIONS */}
            <p className="text-primary mb-1">Drop a CSV file here</p>

            {/* DESCRIPTION — says what the file needs to contain, before the user goes and
                exports one from somewhere. */}
            <p className="text-secondary mb-4">
              One card per row, with a header row naming the columns. Front, back, notes,
              category and draft can each come from any column — you&rsquo;ll match them up next.
            </p>

            {/* BROWSE BUTTON */}
            <Button className="btn-blue" onClick={() => fileInputRef.current?.click()}>
              <FileIcon className="w-4 h-4" />
              Choose a file
            </Button>

            {/* HIDDEN FILE INPUT — opened by the button above */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                // Reset so re-picking the same file still fires onChange.
                e.target.value = "";
              }}
            />
          </div>
        </div>
      )}

      {/* STEP 2 — MAP THE COLUMNS */}
      {step === "mapping" && (
        <div>

          {/* INSTRUCTIONS */}
          <p className="text-secondary mb-4">
            {fileData.length} {fileData.length === 1 ? "row" : "rows"} found. Choose what each
            column holds; anything left as &ldquo;Skip&rdquo; is ignored.
          </p>

          {/* FILE PREVIEW — the first few rows as they were read, so a mis-parsed file
              (wrong delimiter, shifted quotes) is visible before anything is written. */}
          <div className="table-container mb-5">
            <table className="table">
              <thead className="table-header">
                <tr className="table-header-row">
                  {fileHeaders.map((header, index) => (
                    <th key={index} className="table-header-cell">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="table-body">
                {fileData.slice(0, PREVIEW_ROWS).map((row, rowIndex) => (
                  <tr key={rowIndex} className="table-row">
                    {fileHeaders.map((_, cellIndex) => (
                      <td key={cellIndex} className="table-cell rune-import-preview-cell">{row[cellIndex] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* COLUMN MAPPING ROWS */}
          <div className="flex flex-col gap-2">
            {columnMappings.map((mapping) => (
              <div key={mapping.csvColumn} className="rune-import-map-row">

                {/* CSV COLUMN NAME */}
                <span className="text-primary truncate">{mapping.csvColumn}</span>

                {/* TARGET FIELD */}
                <select
                  className="input-field"
                  value={mapping.cardField ?? ""}
                  onChange={(e) => setMapping(mapping.csvColumn, (e.target.value || null) as ImportFieldKey | null)}
                  aria-label={`What the ${mapping.csvColumn} column holds`}
                >
                  <option value="">Skip this column</option>
                  {IMPORT_FIELDS.map((field) => (
                    <option key={field.key} value={field.key}>{field.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* MISSING FRONT WARNING */}
          {!hasFront && (
            <div className="alert-yellow mt-4">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Pick the column holding the question before going on — every card needs one.</span>
            </div>
          )}
        </div>
      )}

      {/* STEP 3 — CHECK WHAT WILL BE WRITTEN */}
      {step === "preview" && preview && (
        <div>

          {/* SUMMARY */}
          <p className="text-secondary mb-4">
            {preview.valid.length} {preview.valid.length === 1 ? "card" : "cards"} ready to add
            to the end of this deck
            {preview.skipped.length > 0 && `, ${preview.skipped.length} skipped`}.
          </p>

          {/* SKIPPED ROWS — named by their line in the file, so they can be found and fixed */}
          {preview.skipped.length > 0 && (
            <div className="alert-yellow mb-4 flex-col items-start">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>These rows won&rsquo;t be imported:</span>
              </div>
              <ul className="mt-2 ml-6 list-disc">
                {preview.skipped.slice(0, 10).map((row) => (
                  <li key={row.rowNumber}>Row {row.rowNumber} — {row.error}</li>
                ))}
                {preview.skipped.length > 10 && <li>and {preview.skipped.length - 10} more</li>}
              </ul>
            </div>
          )}

          {/* CARD PREVIEW */}
          <div className="table-container">
            <table className="table">
              <thead className="table-header">
                <tr className="table-header-row">
                  <th className="table-header-cell">Front</th>
                  <th className="table-header-cell">Back</th>
                  <th className="table-header-cell">Category</th>
                </tr>
              </thead>
              <tbody className="table-body">

                {/* EMPTY PLACEHOLDER */}
                {preview.valid.length === 0 && (
                  <tr className="table-row">
                    <td className="table-empty" colSpan={3}>Nothing in this file can be imported</td>
                  </tr>
                )}

                {preview.valid.slice(0, 20).map((row) => (
                  <tr key={row.rowNumber} className="table-row">
                    <td className="table-cell rune-import-preview-cell">{row.front}</td>
                    <td className="table-cell rune-import-preview-cell">
                      {row.back || <span className="text-subtle-italic">No answer</span>}
                    </td>
                    <td className="table-cell rune-import-preview-cell">{row.category ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* TRUNCATION NOTE */}
          {preview.valid.length > 20 && (
            <p className="text-subtle mt-2">Showing the first 20 of {preview.valid.length}.</p>
          )}
        </div>
      )}

      {/* STEP 4 — IMPORTING */}
      {step === "importing" && (
        <div className="text-center py-8">
          <p className="text-primary mb-2">Adding cards to the deck…</p>
          <p className="text-secondary">{importedCount} of {preview?.valid.length ?? 0} written</p>
        </div>
      )}

      {/* STEP 5 — RESULTS */}
      {step === "results" && (
        <div className="text-center py-8">
          {failedMessage ? (
            <>
              <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-secondary" aria-hidden="true" />
              <p className="text-primary mb-2">{failedMessage}</p>
              <p className="text-secondary">
                {importedCount} {importedCount === 1 ? "card was" : "cards were"} added before it
                stopped. Remove those from your file before trying the rest again.
              </p>
            </>
          ) : (
            <>
              <Check className="w-10 h-10 mx-auto mb-3 text-secondary" aria-hidden="true" />
              <p className="text-primary mb-2">
                {importedCount} {importedCount === 1 ? "card" : "cards"} added
              </p>
              {preview && preview.skipped.length > 0 && (
                <p className="text-secondary">{preview.skipped.length} rows were skipped.</p>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
