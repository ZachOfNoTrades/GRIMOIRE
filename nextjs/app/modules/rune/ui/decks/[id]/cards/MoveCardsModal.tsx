"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";
import { SearchField, SMART_MATCH_HINT } from "@/components/SearchField";
import { makeSearchMatcher } from "@/lib/searchMatch";
import { DeckSummary, DECK_NAME_MAX_LENGTH } from "../../../../types/deck";
import { CardWithProgress } from "../../../../types/card";

// The deck list grows a search field once it is longer than fits at a glance.
const SEARCH_THRESHOLD = 6;

// Sentinel for the "New deck" row — never a real deck id.
const NEW_DECK = "__new__";

export interface MoveTarget {
  id: string;
  name: string;
}

interface MoveCardsModalProps {
  isOpen: boolean;
  // The deck the cards are leaving — excluded from the list and shown as the route's origin.
  sourceDeckId: string;
  sourceDeckName: string;
  // One card (from its row/detail actions) or a selection (from the bulk button).
  cards: CardWithProgress[];
  onClose: () => void;
  // Called once the destination exists. The page applies the move optimistically.
  onMove: (target: MoveTarget) => void;
}

export default function MoveCardsModal({ isOpen, sourceDeckId, sourceDeckName, cards, onClose, onMove }: MoveCardsModalProps) {

  // DATA
  const [ownDecks, setOwnDecks] = useState<DeckSummary[]>([]);
  const [sharedDecks, setSharedDecks] = useState<DeckSummary[]>([]);

  // INPUT
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [newDeckName, setNewDeckName] = useState("");

  // STATE
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh list on every open, so a deck made since the last open is offered.
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setTargetId(null);
    setNewDeckName("");
    setError(null);

    setIsLoading(true);
    fetch("/modules/rune/api/decks")
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((data: { decks?: DeckSummary[]; shared?: DeckSummary[] }) => {
        const notSource = (deck: DeckSummary) => deck.id.toLowerCase() !== sourceDeckId.toLowerCase();
        setOwnDecks((data.decks ?? []).filter(notSource));
        // A view-only share can't take cards, so it isn't offered at all.
        setSharedDecks((data.shared ?? []).filter((deck) => deck.access_role === "edit" && notSource(deck)));
      })
      .catch(() => setError("Couldn't load your decks. Close and try again."))
      .finally(() => setIsLoading(false));
  }, [isOpen, sourceDeckId]);

  // DERIVED
  const count = cards.length;
  const totalDecks = ownDecks.length + sharedDecks.length;
  const showSearch = totalDecks > SEARCH_THRESHOLD;
  const needle = query.trim();
  const matcher = useMemo(() => makeSearchMatcher(needle), [needle]);
  const visibleOwn = useMemo(() => (needle ? ownDecks.filter((deck) => matcher(deck.name)) : ownDecks), [ownDecks, needle, matcher]);
  const visibleShared = useMemo(() => (needle ? sharedDecks.filter((deck) => matcher(deck.name)) : sharedDecks), [sharedDecks, needle, matcher]);

  const isNew = targetId === NEW_DECK;
  const chosenDeck = [...ownDecks, ...sharedDecks].find((deck) => deck.id === targetId) ?? null;
  const destinationName = isNew ? newDeckName.trim() : chosenDeck?.name ?? "";
  const canMove = !isCreating && (isNew ? !!newDeckName.trim() && newDeckName.trim().length <= DECK_NAME_MAX_LENGTH : !!chosenDeck);
  const moveLabel = count === 1 ? "Move card" : `Move ${count} cards`;

  const handleMove = async () => {
    if (!canMove) return;
    setError(null);

    if (chosenDeck) {
      onMove({ id: chosenDeck.id, name: chosenDeck.name });
      return;
    }

    // A new deck has to exist before anything can move into it, so this one step waits.
    setIsCreating(true);
    try {
      const response = await fetch("/modules/rune/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDeckName.trim(), description: null }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error || "Couldn't create the deck");
        return;
      }
      const created = await response.json();
      onMove({ id: created.id, name: created.name });
    } catch {
      setError("Couldn't create the deck");
    } finally {
      setIsCreating(false);
    }
  };

  // One deck row — the golem location picker's option-card shape, with the deck's size
  // (and, for a share, whose deck it is) as the second line.
  const renderDeck = (deck: DeckSummary) => {
    const detail = [
      `${deck.card_count} card${deck.card_count === 1 ? "" : "s"}`,
      deck.owner_name ? `${deck.owner_name}'s deck` : null,
      deck.is_disabled ? "paused" : null,
    ].filter(Boolean).join(", ");
    return (
      <button
        key={deck.id}
        type="button"
        role="radio"
        aria-checked={targetId === deck.id}
        aria-pressed={targetId === deck.id}
        className="option-card"
        onClick={() => setTargetId(deck.id)}
        disabled={isCreating}
      >
        <div className="option-card-body">
          <div className="option-card-title rune-move-deck-name">{deck.name}</div>
          <div className="option-card-desc">{detail}</div>
        </div>
        <span className="option-card-radio" />
      </button>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={count === 1 ? "Move card" : `Move ${count} cards`}
      disableClose={isCreating}
      subHeader={
        // ROUTE — where the cards are going, filled in as a deck is picked. The one place
        // the whole move reads as a sentence before it happens.
        <div className="rune-move-route" data-chosen={destinationName ? "true" : "false"}>

          {/* CARD — a single card names itself; a selection is already counted in the title */}
          {count === 1 && cards[0] && (
            <p className="rune-move-card">{cards[0].front}</p>
          )}

          {/* FROM */}
          <div className="rune-move-stop">
            <span className="rune-move-node" aria-hidden />
            <span className="rune-move-stop-label">From</span>
            <span className="rune-move-stop-name">{sourceDeckName}</span>
          </div>

          {/* TO */}
          <div className="rune-move-stop rune-move-stop--to">
            <span className="rune-move-node" aria-hidden />
            <span className="rune-move-stop-label">To</span>
            <span className="rune-move-stop-name" aria-live="polite">
              {destinationName || (isNew ? "Name the new deck" : "Choose a deck")}
            </span>
          </div>
        </div>
      }
      footer={
        <div className="flex gap-2 justify-end">
          {/* CANCEL BUTTON */}
          <Button onClick={onClose} className="btn-off" disabled={isCreating}>
            Cancel
          </Button>

          {/* MOVE BUTTON — grayed until a destination is chosen */}
          <Button onClick={handleMove} className="btn-blue" disabled={!canMove}>
            {isCreating ? "Creating deck..." : moveLabel}
          </Button>
        </div>
      }
    >
      {/* SEARCH — only once the list is long enough to need it */}
      {showSearch && (
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search decks…"
          className="rune-move-search"
          matchHint={SMART_MATCH_HINT}
        />
      )}

      {/* DECK LIST — a fixed-height scroller once search is on, so typing never resizes the modal */}
      <div className={`rune-move-list ${showSearch ? "rune-move-list--fixed" : ""}`} role="radiogroup" aria-label="Destination deck">

        {/* LOADING */}
        {isLoading && (
          <div className="loading-container">
            <div className="loading-spinner" />
          </div>
        )}

        {!isLoading && (
          <>
            {/* YOUR DECKS */}
            {visibleOwn.length > 0 && sharedDecks.length > 0 && (
              <p className="rune-move-group">Your decks</p>
            )}
            {visibleOwn.map(renderDeck)}

            {/* SHARED WITH YOU — decks you can edit */}
            {visibleShared.length > 0 && (
              <p className="rune-move-group">Shared with you</p>
            )}
            {visibleShared.map(renderDeck)}

            {/* NO MATCHES */}
            {needle && visibleOwn.length === 0 && visibleShared.length === 0 && (
              <p className="text-subtle rune-move-empty">No deck matches “{needle}”.</p>
            )}

            {/* NEW DECK — splitting cards off into a deck that doesn't exist yet. Picking it
                turns the row itself into the name field, so the modal never changes size. */}
            <div className="option-card rune-move-new" aria-pressed={isNew}>
              {isNew ? (
                <>
                  <Plus className="w-4 h-4 option-card-icon" aria-hidden />
                  <input
                    type="text"
                    className="input-field input-field-compact rune-move-new-name"
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleMove(); }}
                    placeholder="New deck name"
                    aria-label="New deck name"
                    maxLength={DECK_NAME_MAX_LENGTH}
                    enterKeyHint="go"
                    disabled={isCreating}
                    // Picking "New deck" is the decision to type a name — focus follows it.
                    autoFocus
                  />
                </>
              ) : (
                <button
                  type="button"
                  role="radio"
                  aria-checked={false}
                  className="option-card-select"
                  onClick={() => setTargetId(NEW_DECK)}
                  disabled={isCreating}
                >
                  <Plus className="w-4 h-4 option-card-icon" aria-hidden />
                  <div className="option-card-body">
                    <div className="option-card-title">New deck</div>
                  </div>
                </button>
              )}
              <span className="option-card-radio" />
            </div>
          </>
        )}
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <p className="text-sm text-alert-red mt-3">{error}</p>
      )}
    </Modal>
  );
}
