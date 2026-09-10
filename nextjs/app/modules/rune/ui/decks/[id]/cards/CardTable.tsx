"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { GripVertical, History, Plus, Sparkles, Trash2, Undo2, EllipsisVertical, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import PopoverMenu from "@/components/PopoverMenu";
import type { TableSelection } from "@/components/ExpandableRowList";
import CardContent from "../../../../components/CardContent";
import RichCardEditor from "../../../../components/RichCardEditor";
import { CardWithProgress, CARD_CATEGORY_MAX } from "../../../../types/card";

// The three prose fields a table row can edit. Notes is here alongside front and back
// because a deck pass is where annotations get written — being able to read every card at
// once and not amend the note on one of them was the gap.
type CellField = "front" | "back" | "notes";

// One row's in-progress edits while the table is in sheet-edit mode — the same shape for a
// card that exists and for one being written, so a row's cells don't care which it is.
export interface CardSheetDraft {
  front: string;
  back: string;
  notes: string;
  category: string;
  isDraft: boolean;
}

// A row added during a sheet pass that isn't a card yet. It holds its own place in the
// table — directly below `afterCardId`, or at the end of the deck when that is null — and
// becomes a card on save. Kept client-side until then because a card needs a front and a
// brand-new row hasn't got one: writing it on creation would leave a blank card behind
// every abandoned insert.
export interface PendingRow extends CardSheetDraft {
  tempId: string;
  afterCardId: string | null;
}

// Which cell currently holds the live editor. Exactly one does: these cells hold rendered
// markdown — images, lists, links — so they are drawn as their rendered selves and swap to
// an editor only where the caret is. Mounting an editor per cell would also mean three per
// card, which a few hundred cards makes untenable.
interface ActiveCell {
  rowKey: string;
  field: CellField;
}

interface CardTableProps {
  cards: CardWithProgress[];
  selection: TableSelection;
  existingCategories: string[];

  // SHEET EDIT — null when the table is in read mode.
  sheetDrafts: Record<string, CardSheetDraft> | null;
  onDraftChange: (cardId: string, patch: Partial<CardSheetDraft>) => void;
  onRevertRow: (card: CardWithProgress) => void;
  isSaving: boolean;

  // NEW ROWS
  pendingRows: PendingRow[];
  onInsertBelow: (card: CardWithProgress | null) => void;
  onPendingChange: (tempId: string, patch: Partial<CardSheetDraft>) => void;
  onDiscardPending: (tempId: string) => void;

  // PER-CARD ACTIONS
  onHistory: (card: CardWithProgress) => void;
  onRefine: (card: CardWithProgress) => void;
  onDelete: (card: CardWithProgress) => void;

  // REORDER — only offered in the deck's own manual order; every other sort would re-sort
  // the dropped row straight back where it came from.
  canReorder: boolean;
  reorderHint: string;
  onReorder: (sourceId: string, afterId: string | null, beforeId: string | null) => void;
}

// Rendered markdown is the expensive thing on this page — a deck of a few hundred cards is
// three react-markdown trees per row — and a sheet pass re-renders the table on every
// keystroke. Memoizing on the text means only the cell being typed into re-parses.
const RenderedText = memo(function RenderedText({ text, className }: { text: string; className?: string }) {
  return <CardContent text={text} className={className} />;
});

// A card's row identity for the maps this component keys on: its own id, or the temp id of
// a row that isn't a card yet.
type Row =
  | { key: string; kind: "card"; card: CardWithProgress; draft: CardSheetDraft | null }
  | { key: string; kind: "pending"; pending: PendingRow };

export default function CardTable({
  cards, selection, existingCategories,
  sheetDrafts, onDraftChange, onRevertRow, isSaving,
  pendingRows, onInsertBelow, onPendingChange, onDiscardPending,
  onHistory, onRefine, onDelete,
  canReorder, reorderHint, onReorder,
}: CardTableProps) {
  const isSheet = sheetDrafts !== null;
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  // Which row's overflow menu is open, and the button it hangs off. One at a time, so a
  // single anchor ref is enough.
  const [menuCardId, setMenuCardId] = useState<string | null>(null);
  const menuAnchorRef = useRef<HTMLElement | null>(null);

  // THE RENDERED SEQUENCE — the filtered cards with each pending row spliced in below the
  // card it was added under. Rows added at the end (the table's own "Add card" row) come
  // last. Built here rather than by the page so a pending row keeps its position even while
  // a search or filter is narrowing the cards around it.
  const rows: Row[] = useMemo(() => {
    const trailing = pendingRows.filter((row) => !row.afterCardId);
    const byAnchor = new Map<string, PendingRow[]>();
    for (const row of pendingRows) {
      if (!row.afterCardId) continue;
      const list = byAnchor.get(row.afterCardId) ?? [];
      list.push(row);
      byAnchor.set(row.afterCardId, list);
    }
    const out: Row[] = [];
    for (const card of cards) {
      out.push({ key: card.id, kind: "card", card, draft: sheetDrafts?.[card.id] ?? null });
      for (const row of byAnchor.get(card.id) ?? []) {
        out.push({ key: row.tempId, kind: "pending", pending: row });
      }
    }
    for (const row of trailing) out.push({ key: row.tempId, kind: "pending", pending: row });
    return out;
  }, [cards, pendingRows, sheetDrafts]);

  // DRAG STATE — `dropAt` is the index, in the list of draggable rows with the dragged one
  // removed, where it would land if released now. Rendered as a rule above that row rather
  // than by shuffling the rows under the finger: these rows are prose and vary in height, so
  // a live reshuffle moves the drop target out from under the pointer mid-gesture.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState(-1);
  const dragIdRef = useRef<string | null>(null);
  const dropAtRef = useRef(-1);
  // Row centres as they were at drag start, in viewport coordinates. Fixed for the gesture —
  // measuring live against rows that are also being restyled is what makes a drop indicator
  // flicker between two slots.
  const positionsRef = useRef<Array<{ id: string; centerY: number; category: string }>>([]);
  const clampRef = useRef<{ min: number; max: number } | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);

  // Only real cards reorder, and only when nothing else owns the row: a pending row has no
  // stored position yet, and selection/sheet mode both put their own control in the gutter.
  const draggable = canReorder && !isSheet && !selection.isSelecting;

  const startDrag = useCallback((event: React.PointerEvent, id: string) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    const tbody = tbodyRef.current;
    if (!tbody) return;

    const cardById = new Map(cards.map((card) => [card.id, card]));
    const els = tbody.querySelectorAll<HTMLElement>("[data-card-id]");
    positionsRef.current = Array.from(els).map((el) => {
      const rect = el.getBoundingClientRect();
      const cardId = el.dataset.cardId ?? "";
      return { id: cardId, centerY: rect.top + rect.height / 2, category: cardById.get(cardId)?.category ?? "" };
    });

    // A drop is clamped to the dragged card's own category run. The table's manual order is
    // read back grouped by category, so a card dropped into another category's run would be
    // re-sorted straight back out of it — persisting a move the user never gets to see. The
    // run is contiguous because that is exactly how the list is sorted.
    const sourceIndex = positionsRef.current.findIndex((p) => p.id === id);
    const withoutSource = positionsRef.current.filter((p) => p.id !== id);
    const sourceCategory = positionsRef.current[sourceIndex]?.category ?? "";
    let min = -1;
    let max = -1;
    for (let i = 0; i < withoutSource.length; i++) {
      if (withoutSource[i].category !== sourceCategory) continue;
      if (min < 0) min = i;
      max = i + 1;
    }
    // The only card in its category has nowhere to go — pin both ends to where it already is
    // so the gesture reads as "no move" rather than dropping it into a neighbouring run.
    if (min < 0) { min = sourceIndex; max = sourceIndex; }
    clampRef.current = { min, max };

    dragIdRef.current = id;
    dropAtRef.current = sourceIndex;
    setDragId(id);
    setDropAt(sourceIndex);

    const onMove = (ev: PointerEvent) => {
      const positions = positionsRef.current;
      let count = 0;
      for (const p of positions) {
        if (p.id === dragIdRef.current) continue;
        if (p.centerY < ev.clientY) count++;
      }
      const clamp = clampRef.current;
      if (clamp) count = Math.max(clamp.min, Math.min(clamp.max, count));
      if (count !== dropAtRef.current) {
        dropAtRef.current = count;
        setDropAt(count);
      }
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cleanup);
      dragIdRef.current = null;
      dropAtRef.current = -1;
      positionsRef.current = [];
      clampRef.current = null;
      setDragId(null);
      setDropAt(-1);
    };

    const finish = () => {
      const sourceId = dragIdRef.current;
      const finalDrop = dropAtRef.current;
      const positions = positionsRef.current;
      cleanup();
      if (!sourceId || finalDrop < 0) return;
      const originalIndex = positions.findIndex((p) => p.id === sourceId);
      if (originalIndex === -1 || finalDrop === originalIndex) return;
      // Hand the page the neighbours rather than a whole order: search and filter mean this
      // table is a subsequence of the deck, and only the page knows the rest of it.
      const without = positions.filter((p) => p.id !== sourceId);
      const afterId = finalDrop > 0 ? without[finalDrop - 1].id : null;
      const beforeId = finalDrop < without.length ? without[finalDrop].id : null;
      onReorder(sourceId, afterId, beforeId);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cleanup);
  }, [cards, onReorder]);

  // Where the drop rule is drawn: the id of the draggable row it sits above, or the sentinel
  // "end" when the card would land after the last one.
  const dropMarker = useMemo(() => {
    if (!dragId || dropAt < 0) return null;
    const without = positionsRef.current.filter((p) => p.id !== dragId);
    const originalIndex = positionsRef.current.findIndex((p) => p.id === dragId);
    if (dropAt === originalIndex) return null;
    return dropAt < without.length ? without[dropAt].id : "end";
  }, [dragId, dropAt]);

  const columnCount = 4;

  const patchRow = (rowKey: string, patch: Partial<CardSheetDraft>) => {
    if (rowKey.startsWith("new:")) onPendingChange(rowKey.slice(4), patch);
    else onDraftChange(rowKey, patch);
  };

  // ONE CELL — rendered markdown by default, an editor where the caret is. Static in read
  // mode; in sheet mode the cell is a control that opens its own editor in place. The two
  // states are deliberately identical in size, padding, type and radius, so opening a cell
  // changes its border and nothing else: the text under the pointer doesn't move or resize,
  // which is what made the old swap feel like a jolt.
  function cell(rowKey: string, field: CellField, value: string, draft: CardSheetDraft | null, label: string, placeholder: string, className: string) {
    const isActive = isSheet && activeCell?.rowKey === rowKey && activeCell.field === field;
    if (isActive && draft) {
      return (
        <RichCardEditor
          bare
          autoFocus
          value={draft[field]}
          onChange={(markdown) => patchRow(rowKey, { [field]: markdown } as Partial<CardSheetDraft>)}
          onDone={() => setActiveCell(null)}
          resetKey={`${rowKey}:${field}`}
          placeholder={placeholder}
          ariaLabel={label}
        />
      );
    }

    const empty = !value.trim();
    const body = empty
      ? <span className="text-subtle-italic">{placeholder}</span>
      : <RenderedText text={value} className={className} />;

    if (!isSheet) return <div className="rune-card-cellbody">{body}</div>;

    return (
      <div
        className="rune-card-cellbody rune-card-celledit"
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={() => setActiveCell({ rowKey, field })}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setActiveCell({ rowKey, field });
          }
        }}
      >
        {body}
      </div>
    );
  }

  return (
    <>
      <div className="table-container rune-card-table-container">
        <table className={`table rune-card-table ${isSheet ? "rune-card-table--editing" : ""}`}>
          <thead className="table-header">
            <tr className="table-header-row">
              <th className="table-header-cell rune-card-col-gutter">
                <span className="sr-only">Position</span>
                <span aria-hidden="true">#</span>
              </th>
              <th className="table-header-cell">Front</th>
              <th className="table-header-cell">Back</th>
              <th className="table-header-cell rune-card-col-actions"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="table-body" ref={tbodyRef}>

            {/* EMPTY PLACEHOLDER — search/filter left nothing. The trailing add row below
                still stands, so an empty result is never a dead end. */}
            {rows.length === 0 && (
              <tr className="table-row">
                <td className="table-empty" colSpan={columnCount}>No cards match</td>
              </tr>
            )}

            {rows.map((row, index) => {
              const card = row.kind === "card" ? row.card : null;
              // The row's editable copy: a pending row IS its own draft, an existing card has
              // one only while the sheet is open. Null means the row renders read-only.
              const draft: CardSheetDraft | null = row.kind === "pending" ? row.pending : row.draft;
              const rowKey = row.kind === "pending" ? `new:${row.pending.tempId}` : row.key;
              const front = draft ? draft.front : card ? card.front : "";
              const back = draft ? draft.back : card ? card.back : "";
              const notes = draft ? draft.notes : card?.notes ?? "";
              const label = front.trim() || "new card";
              const isPending = row.kind === "pending";
              const dirty = !!card && !!draft && isDirty(card, draft);
              const isDragging = !!card && dragId === card.id;
              const showDropRule = !!card && dropMarker === card.id;
              const hasTags = !!card && (card.is_draft || !!card.category);

              return (
                <tr
                  key={row.key}
                  {...(card ? { "data-card-id": card.id } : {})}
                  className={[
                    "table-row rune-card-row",
                    dirty || isPending ? "rune-card-row--dirty" : "",
                    isPending ? "rune-card-row--new" : "",
                    isDragging ? "rune-card-row--dragging" : "",
                    showDropRule ? "rune-card-row--drop" : "",
                  ].filter(Boolean).join(" ")}
                >

                  {/* GUTTER — the row's place in the deck, and whichever control owns that
                      place right now: the drag handle when the order can be changed, the
                      bulk-select box while selecting. One column, three states, so the table
                      never grows a column on the way into a mode. */}
                  <td className="table-cell rune-card-cell rune-card-cell--gutter">
                    {selection.isSelecting && card ? (
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={selection.isSelected(card.id)}
                        onChange={() => selection.toggleSelected(card.id)}
                        aria-label={`Select ${label}`}
                      />
                    ) : (
                      <div className="rune-card-gutter">
                        {draggable && card && (
                          <button
                            type="button"
                            className="rune-card-grip"
                            aria-label={`Reorder ${label}`}
                            title="Drag to reorder"
                            onPointerDown={(e) => startDrag(e, card.id)}
                          >
                            <GripVertical className="w-4 h-4" />
                          </button>
                        )}
                        <span className="rune-card-ord">{index + 1}</span>
                      </div>
                    )}
                  </td>

                  {/* FRONT — the question, and under it the card's filing: what it is
                      categorised as and whether it is held back from study. A second tier
                      rather than two more columns, so the question still lines up with its
                      answer across the row, and a card with neither tag stays one line tall. */}
                  <td className="table-cell rune-card-cell">
                    <span className="rune-card-cell-head">Front</span>
                    {cell(rowKey, "front", front, draft, `Front of ${label}`, "New card", "text-primary")}
                    {draft ? (
                      <div className="rune-card-sub">
                        <input
                          type="text"
                          className="input-field rune-sheet-input"
                          placeholder="Category"
                          maxLength={CARD_CATEGORY_MAX}
                          value={draft.category}
                          onChange={(e) => patchRow(rowKey, { category: e.target.value })}
                          aria-label={`Category of ${label}`}
                          list="rune-sheet-category-options"
                        />
                        <label className="rune-sheet-draft-toggle">
                          <input type="checkbox" className="checkbox" checked={draft.isDraft} onChange={(e) => patchRow(rowKey, { isDraft: e.target.checked })} />
                          <span>Draft</span>
                        </label>
                      </div>
                    ) : hasTags && card && (
                      <div className="rune-card-sub">
                        {card.is_draft && <span className="rune-card-tag rune-card-tag--draft">Draft</span>}
                        {card.category && <span className="rune-card-tag rune-card-tag--category">{card.category}</span>}
                      </div>
                    )}
                  </td>

                  {/* BACK — the answer, and under it the card's notes: the author's own
                      annotation, which belongs beside the answer it annotates rather than in
                      a column of its own that most decks would leave empty. */}
                  <td className="table-cell rune-card-cell">
                    <span className="rune-card-cell-head">Back</span>
                    {cell(rowKey, "back", back, draft, `Back of ${label}`, "No answer", "text-secondary")}
                    {draft ? (
                      <div className="rune-card-sub rune-card-sub--note">
                        <StickyNote className="w-3 h-3 shrink-0" aria-hidden="true" />
                        {cell(rowKey, "notes", notes, draft, `Notes on ${label}`, "Notes", "text-secondary")}
                      </div>
                    ) : notes.trim() ? (
                      <div className="rune-card-sub rune-card-sub--note">
                        <StickyNote className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <RenderedText text={notes} className="text-secondary" />
                      </div>
                    ) : null}
                  </td>

                  {/* ACTIONS — add-below is the row's own visible action, because working
                      down a deck writing the next card is what this view is for. The
                      per-card actions that have no bulk form sit behind the menu beside it;
                      the list view still shows all four inline. In sheet edit the column
                      collapses to a single undo, so a mistyped row can be put back without
                      abandoning the rest of the pass. */}
                  <td className="table-cell rune-card-cell rune-card-cell--actions">
                    <div className="rune-card-actions">
                      {isSheet ? (
                        isPending ? (
                          <Button
                            className="btn-link-red"
                            aria-label="Discard this new row"
                            title="Discard this row"
                            disabled={isSaving}
                            onClick={() => onDiscardPending(row.pending.tempId)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            className="btn-link"
                            aria-label={`Revert changes to ${label}`}
                            title="Revert this row"
                            disabled={!dirty || isSaving}
                            onClick={() => card && onRevertRow(card)}
                          >
                            <Undo2 className="w-4 h-4" />
                          </Button>
                        )
                      ) : card && (
                        <>
                          <Button
                            className="btn-link"
                            aria-label={`Add a card below ${label}`}
                            title="Add a card below this one"
                            onClick={() => onInsertBelow(card)}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                          <Button
                            className="btn-link"
                            aria-label={`More actions for ${label}`}
                            title="More actions"
                            onClick={(e) => {
                              menuAnchorRef.current = e.currentTarget as HTMLElement;
                              setMenuCardId(card.id);
                            }}
                          >
                            <EllipsisVertical className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* DROP RULE AT THE END — the only drop position with no row under it. */}
            {dropMarker === "end" && (
              <tr className="table-row rune-card-row--drop-end"><td colSpan={columnCount} /></tr>
            )}

            {/* ADD ROW — the table's own last line rather than a button above it. In a view
                built to read a whole deck at once, the place to write the next card is at
                the bottom of the deck. */}
            <tr className="table-row rune-card-row--add">
              <td colSpan={columnCount}>
                <button type="button" className="rune-card-add" onClick={() => onInsertBelow(null)}>
                  <Plus className="w-4 h-4" />
                  Add card
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ROW MENU — the per-card actions that have no bulk form. Portaled, so the table's
          own overflow can't clip it. */}
      <PopoverMenu open={menuCardId !== null} onClose={() => setMenuCardId(null)} anchorRef={menuAnchorRef}>
        {(() => {
          const card = cards.find((c) => c.id === menuCardId);
          if (!card) return null;
          return (
            <>
              <button type="button" className="popover-item" onClick={() => { setMenuCardId(null); onHistory(card); }}>
                <History className="w-4 h-4 mr-3" />
                Rating history
              </button>
              <button type="button" className="popover-item" onClick={() => { setMenuCardId(null); onRefine(card); }}>
                <Sparkles className="w-4 h-4 mr-3" />
                Refine card
              </button>
              <button type="button" className="popover-item popover-item-danger" onClick={() => { setMenuCardId(null); onDelete(card); }}>
                <Trash2 className="w-4 h-4 mr-3" />
                Delete card
              </button>
            </>
          );
        })()}
      </PopoverMenu>

      {/* REORDER HINT — says why the grips aren't there, at the one moment it matters. */}
      {!canReorder && !isSheet && cards.length > 1 && (
        <p className="rune-card-reorder-hint">{reorderHint}</p>
      )}

      {/* CATEGORY SUGGESTIONS — the deck's existing category names, so a sheet pass retags
          cards consistently instead of inventing spellings. Same list the card editor offers. */}
      <datalist id="rune-sheet-category-options">
        {existingCategories.map((c) => <option key={c} value={c} />)}
      </datalist>
    </>
  );
}

// True when a row's draft differs from the card it was seeded from. Compared on the trimmed
// values the save would actually write, so trailing whitespace alone doesn't mark a row dirty
// (and can't produce a no-op write).
export function isDirty(card: CardWithProgress, draft: CardSheetDraft): boolean {
  return draft.front.trim() !== card.front.trim()
    || draft.back.trim() !== (card.back ?? "").trim()
    || draft.notes.trim() !== (card.notes ?? "").trim()
    || draft.category.trim() !== (card.category ?? "")
    || draft.isDraft !== card.is_draft;
}

// The draft a card starts an edit session with — also the baseline every dirty check compares
// against, so "changed" means changed against the card as last loaded.
export function draftFromCard(card: CardWithProgress): CardSheetDraft {
  return {
    front: card.front,
    back: card.back ?? "",
    notes: card.notes ?? "",
    category: card.category ?? "",
    isDraft: card.is_draft,
  };
}
