"use client";

import { useState, useEffect, useMemo } from "react";
import { BackLink } from "@/components/BackLink";
import { useRouter } from "next/navigation";
import { useRowNav } from "@/lib/useRowNav";
import { ArrowLeft, Eye, EyeOff, Layers, Plus, Star } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { SearchField, SMART_MATCH_HINT } from "@/components/SearchField";
import { DeckSummary } from "../../types/deck";
import { formatRelativePast } from "@/lib/format";
import { makeSearchMatcher } from "@/lib/searchMatch";
import AddDeckModal from "./AddDeckModal";

// Sort options for the deck list. "favorites" mirrors the server default
// (pinned decks first, then alphabetical); the rest are single-key re-sorts.
type DeckSortKey = "favorites" | "name" | "cards" | "due" | "reviewed";

const SORT_OPTIONS: { value: DeckSortKey; label: string }[] = [
  { value: "favorites", label: "Favorites first" },
  { value: "name", label: "Name (A–Z)" },
  { value: "cards", label: "Most cards" },
  { value: "due", label: "Most due" },
  { value: "reviewed", label: "Recently reviewed" },
];

export default function DecksPage() {

  // DATA
  const [decks, setDecks] = useState<DeckSummary[]>([]);

  // INPUT
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<DeckSortKey>("favorites");
  // Disabled decks are paused, so they're out of the way by default; this reveals them
  // in place (still sorted to the bottom) rather than opening a separate archive screen.
  const [showDisabled, setShowDisabled] = useState(false);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Search narrows first, then the chosen sort orders what's left. Favorites
  // always float above non-favorites in the "favorites" mode; the other modes
  // sort purely by their key so a favorite can sit wherever its value lands.
  const visibleDecks = useMemo(() => {
    const query = searchQuery.trim();

    // Shared normalizer (lib/searchMatch.ts): unit spellings are equated, so a
    // deck named 'Pipe sizes (5")' answers to "5 inch", and every query token
    // must appear somewhere in the name or description but need not be adjacent.
    const matchesQuery = makeSearchMatcher(query);
    const searched = query
      ? decks.filter((deck) => matchesQuery(`${deck.name} ${deck.description ?? ""}`))
      : decks;

    const filtered = showDisabled ? searched : searched.filter((deck) => !deck.is_disabled);

    const reviewedTime = (deck: DeckSummary) =>
      deck.last_reviewed_at ? new Date(deck.last_reviewed_at).getTime() : -Infinity;

    return [...filtered].sort((a, b) => {
      // Disabled decks are paused — they sink below the active ones in every sort mode
      // so the list always leads with what's actually being studied.
      if (a.is_disabled !== b.is_disabled) return Number(a.is_disabled) - Number(b.is_disabled);

      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name);
        case "cards":
          return b.card_count - a.card_count || a.name.localeCompare(b.name);
        case "due":
          return b.due_count - a.due_count || a.name.localeCompare(b.name);
        case "reviewed":
          return reviewedTime(b) - reviewedTime(a) || a.name.localeCompare(b.name);
        case "favorites":
        default:
          return (Number(b.is_favorite) - Number(a.is_favorite)) || a.name.localeCompare(b.name);
      }
    });
  }, [decks, searchQuery, sortKey, showDisabled]);

  // How many decks are paused — the toggle only exists once there's something to reveal.
  const disabledCount = useMemo(() => decks.filter((deck) => deck.is_disabled).length, [decks]);

  const router = useRouter();

  const rowNav = useRowNav();

  // LOAD DATA
  useEffect(() => {
    fetchDecks();
  }, []);

  const fetchDecks = async () => {
    try {
      const response = await fetch("/modules/rune/api/decks");
      if (response.ok) {
        const data = await response.json();
        setDecks(data.decks || []);
      }
    } catch (error) {
      console.error("Error fetching decks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle a deck's favorite flag. Optimistic — flip locally first, revert on
  // failure — so the star responds instantly without a full re-fetch.
  const toggleFavorite = async (deck: DeckSummary) => {
    const next = !deck.is_favorite;
    setDecks((prev) => prev.map((d) => (d.id === deck.id ? { ...d, is_favorite: next } : d)));

    try {
      const response = await fetch(`/modules/rune/api/decks/${deck.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_favorite: next }),
      });
      if (!response.ok) throw new Error("Request failed");
    } catch (error) {
      console.error("Error updating deck favorite:", error);
      setDecks((prev) => prev.map((d) => (d.id === deck.id ? { ...d, is_favorite: !next } : d)));
      toast.error("Couldn't update favorite");
    }
  };

  return (

    // PAGE
    <div className="page">

      <main className="page-container">

        {/* HEADER */}
        <div className="mb-8">

          {/* BACK BUTTON */}
          <BackLink
            fallback="/modules/rune/ui/home"
            className="btn btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </BackLink>

          {/* TITLE */}
          <div>
            <h1 className="text-page-title">Decks</h1>
          </div>
        </div>

        {/* DECKS CARD */}
        <div className="card">

          {/* CARD HEADER */}
          <div className="card-header flex items-center justify-between">
            <h2 className="text-card-title">
              <Layers className="w-5 h-5" />
              Decks
            </h2>

            {/* ADD BUTTON */}
            <Button
              onClick={() => setIsAddModalOpen(true)}
              className="btn-blue"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </Button>
          </div>

          {/* CONTROLS — client-side search + sort over the deck list */}
          {!isLoading && decks.length > 0 && (
            <div className="erow-search-row">

              {/* SEARCH BAR */}
              <SearchField
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search decks…"
                ariaLabel="Search decks"
                matchHint={SMART_MATCH_HINT}
              />

              {/* SORT SELECT */}
              <select
                className="input-field erow-filter-select"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as DeckSortKey)}
                aria-label="Sort decks"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              {/* SHOW-DISABLED TOGGLE — only rendered when some deck is actually disabled,
                  so an unused filter never sits on the page explaining itself. */}
              {disabledCount > 0 && (
                <div>
                  <button
                    type="button"
                    className={`filter-chip ${showDisabled ? "filter-chip--active" : ""}`}
                    onClick={() => setShowDisabled((shown) => !shown)}
                    aria-pressed={showDisabled}
                  >
                    {showDisabled ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showDisabled ? "Hide disabled" : "Show disabled"}
                    <span className="filter-chip-count">{disabledCount}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* DECK TABLE */}
          <div className="table-container">
            <table className="table">
              <thead className="table-header">
                <tr className="table-header-row">
                  <th className="table-header-cell w-0"></th>
                  <th className="table-header-cell">Deck</th>
                  <th className="table-header-cell !text-right w-0">Cards</th>
                  <th className="table-header-cell !text-right w-0">Due</th>
                  <th className="table-header-cell !text-right w-0">Last Reviewed</th>
                </tr>
              </thead>
              <tbody className="table-body">

                {/* LOADING PLACEHOLDER */}
                {isLoading && (
                  <tr className="table-row">
                    <td className="table-empty" colSpan={5}>
                      <div className="loading-container">
                        <div className="loading-spinner" />
                      </div>
                    </td>
                  </tr>
                )}

                {/* EMPTY PLACEHOLDER — no decks at all */}
                {!isLoading && decks.length === 0 && (
                  <tr className="table-row">
                    <td className="table-empty" colSpan={5}>No decks found</td>
                  </tr>
                )}

                {/* EMPTY PLACEHOLDER — decks exist but none are visible. Says which knob emptied the
                    list: with the search box clear, the only thing that can have hidden them is the
                    disabled filter, and a bare "no match" would look like a bug. */}
                {!isLoading && decks.length > 0 && visibleDecks.length === 0 && (
                  <tr className="table-row">
                    <td className="table-empty" colSpan={5}>
                      {searchQuery.trim() ? "No decks match your search" : "Every deck is disabled — use Show disabled to see them"}
                    </td>
                  </tr>
                )}

                {/* DECK ROWS */}
                {!isLoading && visibleDecks.map((deck) => (
                  <tr
                    key={deck.id}
                    className={`table-row-clickable ${deck.is_disabled ? "rune-deck-row-disabled" : ""}`}
                    {...rowNav(`/modules/rune/ui/decks/${deck.id}`)}
                  >

                    {/* FAVORITE STAR — toggles without navigating the row */}
                    <td className="table-cell w-0">
                      <Button
                        className={`btn-link !px-1 ${deck.is_favorite ? "text-alert-yellow" : "text-secondary"}`}
                        aria-label={deck.is_favorite ? "Unfavorite deck" : "Favorite deck"}
                        aria-pressed={deck.is_favorite}
                        title={deck.is_favorite ? "Unfavorite" : "Favorite"}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(deck);
                        }}
                      >
                        <Star className={`w-4 h-4 ${deck.is_favorite ? "fill-current" : ""}`} />
                      </Button>
                    </td>

                    <td className="table-cell">
                      <div>
                        <p className="flex items-center gap-2 flex-wrap">
                          <span className={deck.is_disabled ? "rune-deck-row-name" : ""}>{deck.name}</span>

                          {/* DISABLED BADGE — the deck is paused and counts nothing */}
                          {deck.is_disabled && (
                            <span className="badge badge-gray" title="Paused — not counted as due and not included in the daily review email">Disabled</span>
                          )}
                        </p>
                        {deck.description && (
                          <p className="text-secondary">{deck.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="table-cell !text-right whitespace-nowrap">{deck.card_count}</td>

                    {/* DUE — a disabled deck schedules nothing, so it shows a dash rather than a 0 that looks earned */}
                    <td className="table-cell !text-right whitespace-nowrap">
                      {deck.is_disabled ? <span className="text-subtle">—</span> : deck.due_count}
                    </td>
                    <td className="table-cell !text-right whitespace-nowrap text-secondary">{formatRelativePast(deck.last_reviewed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ADD DECK MODAL */}
      <AddDeckModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onCreated={(deck) => router.push(`/modules/rune/ui/decks/${deck.id}`)}
      />

      {/* TOASTER */}
      <Toaster />
    </div>
  );
}
