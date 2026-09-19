import { CardWithProgress } from "../types/card";

// CSV export of a deck's cards — the inverse of importUtils.ts. The header names are the
// importer's own smart-mapping keywords, so an exported file re-imports (into this deck or
// any other) with every column already matched, and the quoting is the RFC 4180 form that
// importUtils.parseCSV reads: a card's markdown keeps its newlines, commas and quotes.
//
// Card text is exported without its embedded images/videos (see stripMedia).
//
// Source (the card's citation) is exported too even though the importer has no field for
// it — it's the user's data, and the importer simply offers that column as "Skip".

// Embedded images and videos (both markdown `![alt](url)` — see CardContent) are dropped:
// their URLs point at auth-gated per-user uploads, so in a spreadsheet they are dead links,
// and re-imported they would only work for someone who can already open the source deck.
const MEDIA_EMBED = /!\[[^\]]*\]\([^)]*\)/g;

function stripMedia(text: string): string {
  return text
    .replace(MEDIA_EMBED, "")
    // An embed usually sat on its own line — don't leave the empty line (or a run of them).
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const COLUMNS: { header: string; value: (card: CardWithProgress) => string }[] = [
  { header: "Front", value: (card) => stripMedia(card.front) },
  { header: "Back", value: (card) => stripMedia(card.back ?? "") },
  { header: "Notes", value: (card) => stripMedia(card.notes ?? "") },
  { header: "Category", value: (card) => card.category ?? "" },
  // "yes"/blank rather than true/false: reads naturally in a spreadsheet and is one of the
  // importer's accepted truthy values.
  { header: "Draft", value: (card) => (card.is_draft ? "yes" : "") },
  { header: "Source", value: (card) => card.source_ref ?? "" },
];

// Quotes a field when a bare one wouldn't survive the round trip: a delimiter, quote or line
// break would split it, and the importer trims bare fields, so leading/trailing whitespace
// (meaningful in markdown) needs quoting too.
function csvField(value: string): string {
  if (/[",\r\n]/.test(value) || value !== value.trim()) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Builds the file text in the cards' given order. CRLF line endings per RFC 4180 (and what
// Excel writes); a UTF-8 BOM so Excel opens non-ASCII text correctly — the importer strips it.
export function buildCardsCsv(cards: CardWithProgress[]): string {
  const lines = [
    COLUMNS.map((column) => csvField(column.header)).join(","),
    ...cards.map((card) => COLUMNS.map((column) => csvField(column.value(card))).join(",")),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}

// A filesystem-safe file name from the deck name: "Anatomy 101: Bones" → "anatomy-101-bones.csv".
export function csvFileName(deckName: string): string {
  const slug = deckName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "deck"}.csv`;
}

// Hands the text to the browser as a download. The object URL is revoked on the next tick —
// revoking synchronously can cancel the download in Firefox before it starts.
export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
