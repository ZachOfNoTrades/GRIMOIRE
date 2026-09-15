"use client";

import { useState, useEffect, useMemo, use } from "react";
import { BackLink } from "@/components/BackLink";
import { useRouter } from "next/navigation";
import { useRowNav } from "@/lib/useRowNav";
import { ArrowLeft, Layers, Pencil, Trash2 } from "lucide-react";
import toast, { Toaster } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { CardWithProgress } from "../../../types/card";
import { CollectionWithDecks } from "../../../types/collection";
import { DEFAULT_AUTO_ADVANCE_SECONDS, DEFAULT_DAILY_GOAL, DEFAULT_DAILY_MAX_RENEW } from "../../../types/settings";
import { formatRelativePast } from "@/lib/format";
import StudySession, { StudyPreferences } from "../../../components/StudySession";
import ManageCollectionModal from "../ManageCollectionModal";
import DeleteCollectionModal from "./DeleteCollectionModal";

export default function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const rowNav = useRowNav();

  // DATA
  const [collection, setCollection] = useState<CollectionWithDecks | null>(null);
  const [allCards, setAllCards] = useState<CardWithProgress[]>([]);
  const [dueCards, setDueCards] = useState<CardWithProgress[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isStudying, setIsStudying] = useState(false); // in the study UI; the session itself lives in StudySession
  const [handsFree, setHandsFree] = useState(false);
  const [showEditCollection, setShowEditCollection] = useState(false);
  const [showDeleteCollection, setShowDeleteCollection] = useState(false);
  // Study preferences loaded from rune_settings, handed to the study session.
  const [autoAdvanceOnEvaluate, setAutoAdvanceOnEvaluate] = useState(false);
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState(DEFAULT_AUTO_ADVANCE_SECONDS);
  const [evaluationSoundEnabled, setEvaluationSoundEnabled] = useState(true);
  const [dailyGoal, setDailyGoal] = useState<number>(DEFAULT_DAILY_GOAL);
  const [dailyMaxRenew, setDailyMaxRenew] = useState<number>(DEFAULT_DAILY_MAX_RENEW);
  // Distinct cards reviewed today across all decks/sessions, as of the last load.
  const [reviewedToday, setReviewedToday] = useState<number>(0);

  // Soft daily-target progress — same global counters the single-deck screen shows.
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

  // Member decks with the paused ones sunk to the bottom — same ordering rule as the deck
  // list page, so a disabled deck never sits between two decks this collection actually
  // studies. Order within each group is left as the server returned it.
  const orderedDecks = useMemo(() => {
    if (!collection) return [];
    return [...collection.decks].sort((a, b) => Number(a.is_disabled) - Number(b.is_disabled));
  }, [collection]);

  // Category suggestions for the edit-card modal inside a session, pooled across
  // every deck in the collection.
  const existingCategories = useMemo(
    () => Array.from(new Set(allCards.map((c) => c.category).filter((c): c is string => !!c))).sort((a, b) => a.localeCompare(b)),
    [allCards]
  );

  // LOAD DATA
  useEffect(() => {
    fetchCollectionAndCards();
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
  // unfinished and never enter a study session. A blank back is not a reason to hold a
  // card out: it studies as a self-graded card. Mirrors the due_count SQL in
  // collectionFunctions.
  const selectDueCards = (cardList: CardWithProgress[]): CardWithProgress[] => {
    const now = new Date();
    return cardList.filter((c) => !c.is_draft && (!c.next_review_at || new Date(c.next_review_at) <= now));
  };

  const fetchCollectionAndCards = async () => {
    try {
      const [collectionResponse, cardsResponse] = await Promise.all([
        fetch(`/modules/rune/api/collections/${id}`),
        fetch(`/modules/rune/api/collections/${id}/cards`),
      ]);

      if (!collectionResponse.ok) {
        setNotFound(true);
        return;
      }

      setCollection(await collectionResponse.json());

      if (cardsResponse.ok) {
        const cardsData: CardWithProgress[] = await cardsResponse.json();
        setAllCards(cardsData);
        setDueCards(selectDueCards(cardsData));
      }
    } catch (error) {
      console.error("Error fetching collection data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Silent background refetch to reconcile client state with the DB. Returns the
  // fresh list so a running study session can reconcile its own queue.
  const refetchCards = async (): Promise<CardWithProgress[]> => {
    try {
      const response = await fetch(`/modules/rune/api/collections/${id}/cards`);
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
    fetchCollectionAndCards();
    fetchStudyPreferences();
  };

  // Delete collection — the decks it grouped are left untouched.
  const handleDeleteCollection = async () => {
    try {
      const response = await fetch(`/modules/rune/api/collections/${id}`, { method: "DELETE" });
      if (response.ok) {
        router.push("/modules/rune/ui/collections");
      } else {
        toast.error("Failed to delete collection");
      }
    } catch (error) {
      console.error("Error deleting collection:", error);
      toast.error("Failed to delete collection");
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
  if (notFound || !collection) {
    return (
      <div className="page">
        <main className="page-container">
          {/* BACK BUTTON */}
          <BackLink
            fallback="/modules/rune/ui/collections"
            className="btn btn-link !pl-0 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </BackLink>

          {/* NOT FOUND MESSAGE */}
          <div className="card">
            <p className="text-secondary text-center py-8">Collection not found</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <>
      {/* PRE-SESSION: collection info + start button */}
      {!isStudying && (
        <div className="page">
          <main className="page-container rune-deck-container">

            {/* HEADER */}
            <div className="flex items-center justify-between mb-4">
              <div>
                {/* BACK BUTTON */}
                <BackLink
                  fallback="/modules/rune/ui/collections"
                  className="btn btn-link !pl-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </BackLink>

                {/* TITLE */}
                <h1 className="text-page-title">{collection.name}</h1>
                {collection.description && (
                  <p className="text-secondary">{collection.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* EDIT COLLECTION BUTTON */}
                <Button
                  onClick={() => setShowEditCollection(true)}
                  className="btn-off !p-3"
                  title="Edit collection"
                >
                  <Pencil className="w-4 h-4" />
                </Button>

                {/* DELETE COLLECTION BUTTON */}
                <Button
                  onClick={() => setShowDeleteCollection(true)}
                  className="btn-red !p-3"
                  title="Delete collection"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* STATS */}
            <div className="stat-section mb-6">
              {/* DECKS */}
              <div className="stat-card">
                <p className="stat-label">Decks</p>
                <p className="stat-value">{collection.decks.length}</p>
              </div>

              {/* TOTAL CARDS */}
              <div className="stat-card">
                <p className="stat-label">Cards</p>
                <p className="stat-value">{allCards.length}</p>
              </div>

              {/* DUE CARDS — across every deck in the collection */}
              <div className="stat-card">
                <p className="stat-label">Due</p>
                <p className="stat-value">{dueCards.length}</p>
              </div>

              {/* TODAY'S PROGRESS — global daily goal, counts every deck */}
              <div className="stat-card">
                <p className="stat-label">Today · all decks</p>
                <p className={`stat-value ${goalMet ? "text-alert-green" : ""}`}>
                  {reviewedToday}
                  <span className="text-subtle text-base"> / {dailyGoal}</span>
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

            {/* START BUTTON — one session over every due card in the collection */}
            <Button
              onClick={() => setIsStudying(true)}
              className="btn-blue w-full"
              disabled={dueCards.length === 0}
            >
              Start Study Session
            </Button>

            {/* DECKS SECTION */}
            <div className="card mt-6">

              {/* CARD HEADER */}
              <div className="card-header">
                <h2 className="text-card-title">
                  <Layers className="w-5 h-5" />
                  Decks
                </h2>
              </div>

              {/* DECK TABLE */}
              <div className="table-container">
                <table className="table">
                  <thead className="table-header">
                    <tr className="table-header-row">
                      <th className="table-header-cell">Deck</th>
                      <th className="table-header-cell !text-right w-0">Cards</th>
                      <th className="table-header-cell !text-right w-0">Due</th>
                      <th className="table-header-cell !text-right w-0">Last Reviewed</th>
                    </tr>
                  </thead>
                  <tbody className="table-body">

                    {/* EMPTY PLACEHOLDER */}
                    {collection.decks.length === 0 && (
                      <tr className="table-row">
                        <td className="table-empty" colSpan={4}>No decks in this collection — use Edit to add some</td>
                      </tr>
                    )}

                    {/* DECK ROWS */}
                    {orderedDecks.map((deck) => (
                      <tr
                        key={deck.id}
                        className={`table-row-clickable ${deck.is_disabled ? "rune-deck-row-disabled" : ""}`}
                        {...rowNav(`/modules/rune/ui/decks/${deck.id}`)}
                      >
                        <td className="table-cell">
                          <div>
                            <p className="flex items-center gap-2 flex-wrap">
                              <span className={deck.is_disabled ? "rune-deck-row-name" : ""}>{deck.name}</span>

                              {/* DISABLED BADGE — this member deck is paused, so the collection's session skips it */}
                              {deck.is_disabled && (
                                <span className="badge badge-gray" title="Paused — skipped by this collection's study session and left out of its counts">Disabled</span>
                              )}
                            </p>
                            {deck.description && (
                              <p className="text-secondary">{deck.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="table-cell !text-right whitespace-nowrap">{deck.card_count}</td>

                        {/* DUE — a disabled member deck contributes nothing to the collection */}
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

            {/* TOASTER */}
            <Toaster />

            {/* EDIT COLLECTION MODAL */}
            <ManageCollectionModal
              isOpen={showEditCollection}
              collectionId={id}
              initialName={collection.name}
              initialDescription={collection.description}
              initialDeckIds={collection.decks.map((deck) => deck.id)}
              onClose={() => setShowEditCollection(false)}
              onSaved={fetchCollectionAndCards}
            />

            {/* DELETE COLLECTION MODAL */}
            <DeleteCollectionModal
              isOpen={showDeleteCollection}
              onClose={() => setShowDeleteCollection(false)}
              collectionName={collection.name}
              onConfirm={handleDeleteCollection}
            />
          </main>
        </div>
      )}

      {/* STUDY SESSION — one queue drawn from every deck in the collection. Mounted
          even while idle so the first card's audio and images are already warm. */}
      <StudySession
        isActive={isStudying}
        sourceName={collection.name}
        studyApiBase={`/modules/rune/api/collections/${id}`}
        cardUrlBase={`/modules/rune/ui/collections/${id}`}
        cards={dueCards}
        handsFree={handsFree}
        onHandsFreeChange={setHandsFree}
        preferences={studyPreferences}
        existingCategories={existingCategories}
        onRefetchCards={refetchCards}
        onQuit={handleQuitStudy}
        onExit={() => router.push("/modules/rune/ui/collections")}
        exitLabel="Back to Collections"
      />
    </>
  );
}
