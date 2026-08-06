"use client";

import { useState, useEffect, useMemo, use } from "react";
import { BackLink } from "@/components/BackLink";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Pencil, Trash2, Sparkles, History } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import ExpandableRowList from "@/components/ExpandableRowList";
import { Deck } from "../../../types/deck";
import { CardWithProgress } from "../../../types/card";
import { DEFAULT_AUTO_ADVANCE_SECONDS, DEFAULT_DAILY_GOAL, DEFAULT_DAILY_MAX_RENEW } from "../../../types/settings";
import { formatRelativePast } from "@/lib/format";
import { generateUUID } from "@/lib/uuid";
import CardContent from "../../../components/CardContent";
import StudySession, { StudyPreferences } from "../../../components/StudySession";
import ManageCardModal from "./cards/ManageCardModal";
import DeleteCardModal from "./cards/DeleteCardModal";
import RefineCardModal from "./cards/RefineCardModal";
import CardHistoryModal from "./cards/CardHistoryModal";
import RefineDeckModal from "./RefineDeckModal";
import EditDeckModal from "./EditDeckModal";
import DeleteDeckModal from "./DeleteDeckModal";

export default function DeckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  // DATA
  const [deck, setDeck] = useState<Deck | null>(null);
  const [allCards, setAllCards] = useState<CardWithProgress[]>([]);
  const [dueCards, setDueCards] = useState<CardWithProgress[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isStudying, setIsStudying] = useState(false); // in the study UI; the session itself lives in StudySession
  const [handsFree, setHandsFree] = useState(false);
  // Study preferences loaded from rune_settings, handed to the study session.
  const [autoAdvanceOnEvaluate, setAutoAdvanceOnEvaluate] = useState(false);
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState(DEFAULT_AUTO_ADVANCE_SECONDS);
  const [evaluationSoundEnabled, setEvaluationSoundEnabled] = useState(true);
  const [dailyGoal, setDailyGoal] = useState<number>(DEFAULT_DAILY_GOAL);
  const [dailyMaxRenew, setDailyMaxRenew] = useState<number>(DEFAULT_DAILY_MAX_RENEW);
  // Distinct cards reviewed today across all decks/sessions, as of the last load.
  const [reviewedToday, setReviewedToday] = useState<number>(0);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [editingCard, setEditingCard] = useState<CardWithProgress | null>(null);
  const [deletingCard, setDeletingCard] = useState<CardWithProgress | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteCards, setShowBulkDeleteCards] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showEditDeck, setShowEditDeck] = useState(false);
  const [showDeleteDeck, setShowDeleteDeck] = useState(false);
  const [refiningCard, setRefiningCard] = useState<CardWithProgress | null>(null);
  const [historyCard, setHistoryCard] = useState<CardWithProgress | null>(null); // card whose rating history is open
  const [showRefineDeck, setShowRefineDeck] = useState(false);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null); // which card's detail (front+back) is open in the row list

  // Soft daily-target progress. Both thresholds are soft — goalMet is motivational,
  // overMaxRenew only warns; neither hides or blocks any due card.
  const goalMet = reviewedToday >= dailyGoal;
  const overMaxRenew = reviewedToday >= dailyMaxRenew;

  const studyPreferences: StudyPreferences = {
    autoAdvanceOnEvaluate,
    autoAdvanceSeconds,
    evaluationSoundEnabled,
    dailyGoal,
    dailyMaxRenew,
    reviewedTodayBaseline: reviewedToday,
  };

  // Distinct category names present in the deck, sorted — feeds both the
  // ManageCardModal's category suggestions and the card list's category filter.
  const existingCategories = useMemo(
    () => Array.from(new Set(allCards.map((c) => c.category).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b)),
    [allCards]
  );

  // Cards sorted by category (uncategorized last), preserving each category's
  // manual order_index — required for ExpandableRowList's getSectionLabel
  // grouping, which only detects contiguous runs rather than sorting itself.
  const categorySortedCards = useMemo(() => {
    return [...allCards].sort((a, b) => {
      if (a.category !== b.category) {
        if (!a.category) return 1;
        if (!b.category) return -1;
        return a.category.localeCompare(b.category);
      }
      return a.order_index - b.order_index;
    });
  }, [allCards]);

  // How many cards are drafts — gates the draft filter options (below): with zero
  // drafts the extra dropdown group is just noise, so it's omitted entirely.
  const draftCount = useMemo(() => allCards.filter((c) => c.is_draft).length, [allCards]);

  // LOAD DATA
  useEffect(() => {
    fetchDeckAndCards();
  }, [id]);

  // LOAD STUDY PREFERENCES — auto-advance + evaluation-sound settings from rune_settings.
  useEffect(() => {
    fetchStudyPreferences();
  }, []);

  const fetchStudyPreferences = async () => {
    try {
      const response = await fetch("/modules/rune/api/settings");
      if (!response.ok) return;
      const data = await response.json();
      setAutoAdvanceOnEvaluate(Boolean(data.autoAdvanceOnEvaluate));
      if (Number.isFinite(data.autoAdvanceSeconds)) setAutoAdvanceSeconds(data.autoAdvanceSeconds);
      setEvaluationSoundEnabled(data.evaluationSoundEnabled !== false);
      if (Number.isFinite(data.dailyGoal)) setDailyGoal(data.dailyGoal);
      if (Number.isFinite(data.dailyMaxRenew)) setDailyMaxRenew(data.dailyMaxRenew);
      if (Number.isFinite(data.reviewedToday)) setReviewedToday(data.reviewedToday);
    } catch {
      // best-effort — fall back to defaults on failure
    }
  };

  // Due cards feed the study session. Draft cards are excluded — they're
  // unfinished and never enter a study session.
  const selectDueCards = (cardList: CardWithProgress[]): CardWithProgress[] => {
    const now = new Date();
    return cardList.filter((c) => !c.is_draft && (!c.next_review_at || new Date(c.next_review_at) <= now));
  };

  const fetchDeckAndCards = async () => {
    try {
      const [deckResponse, cardsResponse] = await Promise.all([
        fetch(`/modules/rune/api/decks/${id}`),
        fetch(`/modules/rune/api/decks/${id}/cards`),
      ]);

      if (!deckResponse.ok) {
        setNotFound(true);
        return;
      }

      const deckData = await deckResponse.json();
      setDeck(deckData);

      if (cardsResponse.ok) {
        const cardsData: CardWithProgress[] = await cardsResponse.json();
        setAllCards(cardsData);
        setDueCards(selectDueCards(cardsData));
      }
    } catch (error) {
      console.error("Error fetching deck data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Silent background refetch to reconcile client state with the DB. Returns the
  // fresh list so a running study session can reconcile its own queue.
  const refetchCards = async (): Promise<CardWithProgress[]> => {
    try {
      const response = await fetch(`/modules/rune/api/decks/${id}/cards`);
      if (!response.ok) return allCards;

      const freshCards: CardWithProgress[] = await response.json();
      setAllCards(freshCards);
      setDueCards(selectDueCards(freshCards));
      return freshCards;
    } catch (error) {
      console.error("Error refetching cards:", error);
      return allCards;
    }
  };

  // Leaving the study session: refresh the landing screen's Due / Last Reviewed /
  // today's-progress stats, which the ratings just submitted have moved.
  const handleQuitStudy = () => {
    setIsStudying(false);
    fetchDeckAndCards();
    fetchStudyPreferences();
  };

  // Add a new card
  const handleAddCard = async (front: string, back: string, notes: string | null, category: string | null, isDraft: boolean) => {
    // Client update with temp card
    const tempId = generateUUID();
    const tempCard: CardWithProgress = { id: tempId, deck_id: id, front, back, notes, category, source: "manual", source_id: null, order_index: allCards.length, is_disabled: false, is_draft: isDraft, created_at: new Date(), modified_at: new Date(), ease_factor: null, interval_days: null, repetitions: null, next_review_at: null, last_reviewed_at: null, last_rating: null };
    setAllCards((prev) => [...prev, tempCard]);
    // Draft cards never enter the due list — they're excluded from study.
    if (!isDraft) {
      setDueCards((prev) => [...prev, tempCard]);
    }
    setIsAddingCard(false);

    // Background DB insert + refetch to get real ID
    await fetch(`/modules/rune/api/decks/${id}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ front, back, notes, category, is_draft: isDraft }),
    });
    refetchCards();
  };

  // Edit an existing card
  const handleEditCard = async (cardId: string, front: string, back: string, notes: string | null, category: string | null, isDraft: boolean) => {
    // Client update first
    setAllCards((prev) =>
      prev.map((c) => c.id === cardId ? { ...c, front, back, notes, category, is_draft: isDraft } : c)
    );
    setDueCards((prev) =>
      prev.map((c) => c.id === cardId ? { ...c, front, back, notes, category, is_draft: isDraft } : c)
    );
    setEditingCard(null);

    // Background DB update + refetch
    await fetch(`/modules/rune/api/decks/${id}/cards`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId, front, back, notes, category, is_draft: isDraft }),
    });
    refetchCards();
  };

  // Delete a single card
  const handleDeleteCard = async (cardId: string) => {
    // Client update first
    setAllCards((prev) => prev.filter((c) => c.id !== cardId));
    setDueCards((prev) => prev.filter((c) => c.id !== cardId));
    setDeletingCard(null);
    setExpandedCardId((cur) => (cur === cardId ? null : cur));

    // Background DB delete + refetch
    try {
      const response = await fetch(`/modules/rune/api/decks/${id}/cards`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
      if (!response.ok) {
        toast.error("Failed to delete card");
      }
    } catch {
      toast.error("Failed to delete card");
    }
    refetchCards();
  };

  // Bulk delete selected cards
  const handleBulkDeleteCards = async () => {
    if (selectedCardIds.size === 0) return;

    // Client update first
    const idsToDelete = new Set(selectedCardIds);
    setAllCards((prev) => prev.filter((c) => !idsToDelete.has(c.id)));
    setDueCards((prev) => prev.filter((c) => !idsToDelete.has(c.id)));
    setSelectedCardIds(new Set());
    setShowBulkDeleteCards(false);
    setExpandedCardId((cur) => (cur && idsToDelete.has(cur) ? null : cur));

    // Background DB deletes
    setIsBulkDeleting(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const cardId of idsToDelete) {
        try {
          const response = await fetch(`/modules/rune/api/decks/${id}/cards`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cardId }),
          });
          if (response.ok) { successCount++; } else { failCount++; }
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Deleted ${successCount} card${successCount === 1 ? "" : "s"}`);
      }
      if (failCount > 0) {
        toast.error(`Failed to delete ${failCount} card${failCount === 1 ? "" : "s"}`);
      }

      // Refetch for data integrity
      refetchCards();
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Handle card-level refinement result
  const handleCardRefined = (cardId: string, front: string, back: string, notes: string | null) => {
    setAllCards((prev) =>
      prev.map((c) => c.id === cardId ? { ...c, front, back, notes } : c)
    );
    setDueCards((prev) =>
      prev.map((c) => c.id === cardId ? { ...c, front, back, notes } : c)
    );
    refetchCards();
  };

  // Edit deck
  const handleEditDeck = async (name: string, description: string | null, sourceUrl: string | null) => {
    try {
      const response = await fetch(`/modules/rune/api/decks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, sourceUrl }),
      });
      if (response.ok) {
        setDeck((prev) => prev ? { ...prev, name, description, source_url: sourceUrl } : prev);
        setShowEditDeck(false);
      } else {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to update deck");
      }
    } catch (error) {
      console.error("Error updating deck:", error);
      toast.error("Failed to update deck");
    }
  };

  // Delete deck
  const handleDeleteDeck = async () => {
    const response = await fetch(`/modules/rune/api/decks/${id}`, { method: "DELETE" });
    if (response.ok) {
      router.push("/modules/rune/ui/decks");
    }
  };

  // LOADING
  if (isLoading) {
    return (
      <div className="page">
        <main className="page-container">
          <div className="loading-container py-16">
            <div className="loading-spinner" />
          </div>
        </main>
      </div>
    );
  }

  // NOT FOUND
  if (notFound || !deck) {
    return (
      <div className="page">
        <main className="page-container">
          {/* BACK BUTTON */}
          <BackLink
            fallback="/modules/rune/ui/decks"
            className="btn btn-link !pl-0 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </BackLink>

          {/* NOT FOUND MESSAGE */}
          <div className="card">
            <p className="text-secondary text-center py-8">Deck not found</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <>
      {/* PRE-SESSION: deck info + start button */}
      {!isStudying && (
        <div className="page">
          <main className="page-container rune-deck-container">

            {/* HEADER */}
            <div className="flex items-center justify-between mb-4">
              <div>
                {/* BACK BUTTON */}
                <BackLink
                  fallback="/modules/rune/ui/decks"
                  className="btn btn-link !pl-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </BackLink>

                {/* TITLE */}
                <h1 className="text-page-title">{deck.name}</h1>
                {deck.description && (
                  <p className="text-secondary">{deck.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* REFINE DECK BUTTON */}
                <Button
                  onClick={() => setShowRefineDeck(true)}
                  className="btn-off !p-3"
                  title="Refine deck with AI"
                  disabled={allCards.length === 0}
                >
                  <Sparkles className="w-4 h-4" />
                </Button>

                {/* EDIT DECK BUTTON */}
                <Button
                  onClick={() => setShowEditDeck(true)}
                  className="btn-off !p-3"
                  title="Edit deck"
                >
                  <Pencil className="w-4 h-4" />
                </Button>

                {/* DELETE DECK BUTTON */}
                <Button
                  onClick={() => setShowDeleteDeck(true)}
                  className="btn-red !p-3"
                  title="Delete deck"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* STATS */}
            <div className="stat-section mb-6">
              {/* TOTAL CARDS */}
              <div className="stat-card">
                <p className="stat-label">Cards</p>
                <p className="stat-value">{allCards.length}</p>
              </div>

              {/* DUE CARDS */}
              <div className="stat-card">
                <p className="stat-label">Due</p>
                <p className="stat-value">{dueCards.length}</p>
              </div>

              {/* TODAY'S PROGRESS — global daily goal, counts every deck (not just this one) */}
              <div className="stat-card">
                <p className="stat-label">Today · all decks</p>
                <p className={`stat-value ${goalMet ? "text-alert-green" : ""}`}>
                  {reviewedToday}
                  <span className="text-subtle text-base"> / {dailyGoal}</span>
                </p>
              </div>

              {/* LAST REVIEWED */}
              <div className="stat-card">
                <p className="stat-label">Last Reviewed</p>
                <p className="stat-value text-base">
                  {formatRelativePast(deck.last_reviewed_at)}
                </p>
              </div>
            </div>

            {/* DAILY MAX RENEW WARNING (soft — never blocks study) */}
            {overMaxRenew && (
              <p className="text-alert-yellow text-sm mb-3">
                You&apos;ve reviewed {reviewedToday} cards today, past your daily max of {dailyMaxRenew}. All due cards stay available — this is just a nudge to rest.
              </p>
            )}

            {/* HANDS-FREE CHECKBOX */}
            <label className="flex items-center gap-2 mb-3 cursor-pointer text-secondary">
              <input
                type="checkbox"
                checked={handsFree}
                onChange={(e) => setHandsFree(e.target.checked)}
              />
              Hands-free mode
            </label>

            {/* START BUTTON */}
            <Button
              onClick={() => setIsStudying(true)}
              className="btn-blue w-full"
              disabled={dueCards.length === 0}
            >
              Start Study Session
            </Button>

            {/* CARDS SECTION */}
            <div className="card mt-6">

              {/* CARD HEADER */}
              <div className="card-header">
                <h2 className="text-card-title">
                  Cards
                </h2>

                <div className="flex items-center gap-2">

                  {/* BULK DELETE BUTTON */}
                  <Button
                    onClick={() => setShowBulkDeleteCards(true)}
                    disabled={selectedCardIds.size === 0 || isBulkDeleting}
                    className="btn-red relative !p-2"
                    title={selectedCardIds.size > 0 ? `Delete ${selectedCardIds.size} card${selectedCardIds.size === 1 ? "" : "s"}` : "Select cards to delete"}
                  >
                    <Trash2 className="w-4 h-4" />
                    {selectedCardIds.size > 0 && (
                      <span className="notification-count-red absolute -top-1 -right-1">
                        {selectedCardIds.size}
                      </span>
                    )}
                  </Button>
                </div>
              </div>

              <div className="card-content">

                {/* ADD CARD BUTTON */}
                <div className="pb-3">
                  <Button
                    onClick={() => setIsAddingCard(true)}
                    className="btn-link w-full"
                  >
                    <Plus className="w-4 h-4" />
                    Add Card
                  </Button>
                </div>

                {/* EMPTY PLACEHOLDER */}
                {allCards.length === 0 && (
                  <div className="empty-state">
                    <p className="empty-state-title">No cards in this deck</p>
                    <p className="empty-state-body">Add one to get started.</p>
                  </div>
                )}

                {allCards.length > 0 && (

                  /* CARD ROWS — front is the row label (marquees on hover if it
                     overflows); expanding a row swaps in the full front/back/notes
                     detail instead of opening a modal. Bulk selection (for the
                     header's delete button) is the row list's own built-in
                     "Select" mode — feeds selectedCardIds. The category filter dropdown
                     also carries a "Status" group (Drafts / Published) when the deck has
                     any drafts — see filterExtraOptions. */
                  <ExpandableRowList
                    items={categorySortedCards}
                    getId={(card) => card.id}
                    selectedId={expandedCardId}
                    onToggle={(id) => setExpandedCardId((cur) => (cur === id ? null : id))}
                    selectable
                    selectedIds={selectedCardIds}
                    onSelectedIdsChange={setSelectedCardIds}
                    searchable
                    searchPlaceholder="Search cards…"
                    getSearchText={(card) => `${card.front} ${card.back} ${card.notes ?? ""}`}
                    filterLabel="Category"
                    getFilterValue={(card) => card.category}
                    // Draft status folded into the same filter dropdown (only when the
                    // deck actually has drafts) rather than a separate control.
                    filterExtraGroupLabel="Status"
                    filterExtraOptions={draftCount > 0 ? [
                      { value: "__drafts__", label: `Drafts (${draftCount})`, predicate: (card) => card.is_draft },
                      { value: "__published__", label: "Published", predicate: (card) => !card.is_draft },
                    ] : undefined}
                    getSectionLabel={(card) => card.category || "Uncategorized"}
                    groupToggleLabel="Group by category"
                    renderLabel={(card) => card.front}
                    // Subtle leading dot marks draft cards in the list; the framed icon
                    // tile would be too heavy for a status indicator.
                    renderMarker={(card) => (card.is_draft ? <span className="dot-yellow" title="Draft" aria-label="Draft" /> : null)}
                    labelLines={3}
                    backLabel="Cards"
                    detailEmptyMessage="Select a card to view its back"
                    renderDetailHeader={(card) => (
                      <>
                        <h3 className="text-card-title flex-1 min-w-0">{card.front}</h3>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button className="btn-link" aria-label="Rating history" title="Rating history" onClick={() => setHistoryCard(card)}>
                            <History className="w-4 h-4" />
                          </Button>
                          <Button className="btn-link" aria-label="Edit card" onClick={() => setEditingCard(card)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button className="btn-link" aria-label="Refine card" onClick={() => setRefiningCard(card)}>
                            <Sparkles className="w-4 h-4" />
                          </Button>
                          <Button className="btn-link-red" aria-label="Delete card" onClick={() => setDeletingCard(card)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </>
                    )}
                    renderDetail={(card) => (
                      <div className="flex flex-col gap-4">
                        <div>
                          <p className="text-subtle text-xs mb-1">Back</p>
                          {/* CardContent renders markdown (incl. pasted images) — same
                              renderer the study session uses, so an embedded image
                              shows up here too instead of just its raw ![]() syntax. */}
                          <CardContent text={card.back} className="text-primary" />
                        </div>
                        {card.notes && (
                          <div>
                            <p className="text-subtle text-xs mb-1">Notes</p>
                            <CardContent text={card.notes} className="text-secondary" />
                          </div>
                        )}
                        {(card.is_draft || card.category || (card.source && card.source !== "manual")) && (
                          <div className="flex flex-wrap gap-2">
                            {/* DRAFT BADGE — draft cards are hidden from study and the due count */}
                            {card.is_draft && (
                              <span className="badge-yellow inline-flex items-center gap-1 w-fit">Draft</span>
                            )}
                            {card.category && (
                              <span className="badge-blue inline-flex items-center gap-1 w-fit">{card.category}</span>
                            )}
                            {card.source && card.source !== "manual" && (
                              <span className="badge-gray inline-flex items-center gap-1 w-fit capitalize">{card.source}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  />
                )}
              </div>
            </div>

            {/* TOASTER */}
            <Toaster />

            {/* MANAGE CARD MODAL (add / edit) */}
            <ManageCardModal
              isOpen={isAddingCard || !!editingCard}
              editCard={editingCard}
              onClose={() => { setIsAddingCard(false); setEditingCard(null); }}
              onAdd={handleAddCard}
              onEdit={handleEditCard}
              existingCategories={existingCategories}
            />

            {/* DELETE CARD MODAL (single) */}
            <DeleteCardModal
              card={deletingCard}
              onClose={() => setDeletingCard(null)}
              onConfirm={() => deletingCard ? handleDeleteCard(deletingCard.id) : Promise.resolve()}
            />

            {/* DELETE CARD MODAL (bulk) */}
            <DeleteCardModal
              isOpen={showBulkDeleteCards}
              bulkCount={selectedCardIds.size}
              onClose={() => setShowBulkDeleteCards(false)}
              onConfirm={handleBulkDeleteCards}
            />

            {/* REFINE DECK MODAL */}
            <RefineDeckModal
              isOpen={showRefineDeck}
              deckId={id}
              onClose={() => setShowRefineDeck(false)}
              onApplied={refetchCards}
            />

            {/* REFINE CARD MODAL */}
            <RefineCardModal
              card={refiningCard}
              deckId={id}
              onClose={() => setRefiningCard(null)}
              onRefined={handleCardRefined}
            />

            {/* CARD RATING HISTORY MODAL */}
            <CardHistoryModal
              card={historyCard}
              deckId={id}
              onClose={() => setHistoryCard(null)}
            />

            {/* EDIT DECK MODAL */}
            <EditDeckModal
              isOpen={showEditDeck}
              onClose={() => setShowEditDeck(false)}
              name={deck.name}
              description={deck.description}
              sourceUrl={deck.source_url}
              onSave={handleEditDeck}
            />

            {/* DELETE DECK MODAL */}
            <DeleteDeckModal
              isOpen={showDeleteDeck}
              onClose={() => setShowDeleteDeck(false)}
              deckName={deck.name}
              onConfirm={handleDeleteDeck}
            />
          </main>
        </div>
      )}

      {/* STUDY SESSION — mounted even while idle so the first card's audio and
          images are already warm when "Start Study Session" is pressed. */}
      <StudySession
        isActive={isStudying}
        sourceName={deck.name}
        studyApiBase={`/modules/rune/api/decks/${id}`}
        cardUrlBase={`/modules/rune/ui/decks/${id}`}
        cards={dueCards}
        handsFree={handsFree}
        onHandsFreeChange={setHandsFree}
        preferences={studyPreferences}
        existingCategories={existingCategories}
        onRefetchCards={refetchCards}
        onQuit={handleQuitStudy}
        onExit={() => router.push("/modules/rune/ui/decks")}
        exitLabel="Back to Decks"
      />
    </>
  );
}
