"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, X, ChevronLeft, ChevronRight, Volume2, CircleStop, Mic, Square, BrainCircuit, ChevronDown, Plus } from "lucide-react";
import { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Deck } from "../../../types/deck";
import { CardWithProgress } from "../../../types/card";
import { useSpeaker } from "../../../lib/voice/useSpeaker";
import { useListener } from "../../../lib/voice/useListener";
import type { EvaluationResult } from "../../../lib/voice/evaluationFunctions";
import ManageCardModal from "./cards/ManageCardModal";

// Fisher-Yates shuffle
function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Format duration from milliseconds to human-readable
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

// Map rating number to progress segment class
function ratingToSegmentClass(rating: number | null): string {
  if (rating === null) return "";
  if (rating === 1) return "flashcard-progress-segment-again";
  if (rating === 2) return "flashcard-progress-segment-hard";
  if (rating === 3) return "flashcard-progress-segment-good";
  return "flashcard-progress-segment-easy";
}

// Map rating number to display label
function ratingToLabel(rating: number): string {
  if (rating === 1) return "again";
  if (rating === 2) return "hard";
  if (rating === 3) return "good";
  return "easy";
}

export default function DeckDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  // DATA
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<(CardWithProgress & { sessionRating: number | null })[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [studySessionId, setStudySessionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const { isSpeaking, preloadQuestion, speakQuestion, stopSpeaking, audioRef } = useSpeaker();
  const { isRecording, isTranscribing, transcript, startRecording, stopRecording, cancelRecording, clearTranscript } = useListener();
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [handsFree, setHandsFree] = useState(false);
  const [cardsExpanded, setCardsExpanded] = useState(false);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const handsFreeRef = useRef(false); // Ref to track hands-free in async callbacks

  // Refs for duration tracking
  const sessionStartRef = useRef<number>(0);
  const sessionDurationRef = useRef<number>(0);

  // Derived
  const currentCard = cards[currentIndex] || null;
  const currentCardAlreadyRated = currentCard?.sessionRating !== null;

  // Preload TTS audio when current card changes
  useEffect(() => {
    if (currentCard && studySessionId) {
      preloadQuestion(currentCard.front);
    }
  }, [currentIndex, studySessionId]);

  // Stop recording and clear state when card changes
  useEffect(() => {
    cancelRecording();
    stopSpeaking();
    clearTranscript();
    setEvaluationResult(null);
  }, [currentIndex]);

  // Hands-free auto-loop: speak question, then auto-record
  useEffect(() => {
    if (!handsFreeRef.current || !studySessionId || !currentCard) return;

    let cancelled = false;

    const runHandsFree = async () => {
      // Speak the question
      await speakQuestion(currentCard.front);
      if (cancelled || !handsFreeRef.current) return;

      // Auto-start recording after TTS finishes
      try {
        await startRecording();
      } catch {
        // Mic permission denied — disable hands-free
        handsFreeRef.current = false;
        setHandsFree(false);
      }
    };

    runHandsFree();

    return () => { cancelled = true; };
  }, [currentIndex, studySessionId]);

  // Auto-evaluate when transcript arrives in hands-free mode
  useEffect(() => {
    if (handsFreeRef.current && transcript) {
      handleEvaluate();
    }
  }, [transcript]);

  // Auto-speak evaluation result in hands-free mode, then auto-rate after 5s
  useEffect(() => {
    if (!handsFreeRef.current || !evaluationResult) return;

    let rateTimer: ReturnType<typeof setTimeout>;

    const run = async () => {
      await speakQuestion(evaluationResult.explanation);
      if (!handsFreeRef.current) return;

      // Wait 5 seconds then auto-rate with suggested rating
      rateTimer = setTimeout(() => {
        if (handsFreeRef.current) {
          handleRate(evaluationResult.suggestedRating);
        }
      }, 5000);
    };

    run();

    return () => { clearTimeout(rateTimer); };
  }, [evaluationResult]);

  // Disable hands-free mode (used when user manually interrupts)
  const disableHandsFree = () => {
    handsFreeRef.current = false;
    setHandsFree(false);
  };

  // Speak the question, then auto-record if hands-free is on
  const handleSpeakAndRecord = async () => {
    if (!currentCard) return;
    await speakQuestion(currentCard.front);
    if (!handsFreeRef.current) return;

    try {
      await startRecording();
    } catch {
      handsFreeRef.current = false;
      setHandsFree(false);
    }
  };

  // Evaluate the user's spoken answer against the expected answer
  const handleEvaluate = async () => {
    if (!currentCard || !transcript) return;

    setIsEvaluating(true);
    try {
      const response = await fetch(`/modules/rune/api/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentCard.front,
          expectedAnswer: currentCard.back,
          userAnswer: transcript,
          notes: currentCard.notes,
        }),
      });

      if (!response.ok) {
        console.error("Evaluation failed");
        return;
      }

      const result: EvaluationResult = await response.json();
      setEvaluationResult(result);

      // Reveal the answer
      setIsFlipped(true);
    } catch (error) {
      console.error("Evaluation error:", error);
    } finally {
      setIsEvaluating(false);
    }
  };

  // LOAD DATA
  useEffect(() => {
    fetchDeckAndCards();
  }, [id]);

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
        // Shuffle and add sessionRating tracking
        const shuffled = shuffle(cardsData).map((c) => ({ ...c, sessionRating: null as number | null }));
        setCards(shuffled);
      }
    } catch (error) {
      console.error("Error fetching deck data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Start a hands-free study session
  const startHandsFree = async () => {
    handsFreeRef.current = true;
    setHandsFree(true);
    await startSession();
  };

  // Start a study session
  const startSession = async () => {
    try {
      const response = await fetch(`/modules/rune/api/decks/${id}/study`, { method: "POST" });
      if (response.ok) {
        const data = await response.json();
        setStudySessionId(data.sessionId);
        sessionStartRef.current = Date.now();
      }
    } catch (error) {
      console.error("Error starting study session:", error);
    }
  };

  // Complete the study session
  const completeSession = async () => {
    if (!studySessionId) return;
    sessionDurationRef.current = Date.now() - sessionStartRef.current;
    const durationSeconds = Math.floor(sessionDurationRef.current / 1000);
    try {
      await fetch(`/modules/rune/api/decks/${id}/study/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studySessionId, durationSeconds }),
      });
    } catch (error) {
      console.error("Error completing session:", error);
    }
  };

  // Flip the card
  const handleFlip = useCallback(() => {
    setIsFlipped((f) => !f);
  }, []);

  // Rate a card
  const handleRate = useCallback(
    async (rating: number) => {
      if (!currentCard || currentCardAlreadyRated) return;

      // Update local state
      setCards((prev) =>
        prev.map((c) =>
          c.id === currentCard.id ? { ...c, sessionRating: rating } : c
        )
      );

      // Submit review to API
      if (studySessionId) {
        try {
          await fetch(`/modules/rune/api/decks/${id}/study/review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cardId: currentCard.id,
              studySessionId,
              rating,
              responseTimeMs: null,
            }),
          });
        } catch (error) {
          console.error("Error submitting review:", error);
        }
      }

      // Advance to next card after brief delay
      setIsFlipped(false);
      setTimeout(() => {
        if (currentIndex < cards.length - 1) {
          setCurrentIndex((i) => i + 1);
        } else {
          // Check if all cards in full deck are rated
          const allRated = cards.every(
            (c) => c.id === currentCard.id || c.sessionRating !== null
          );
          if (allRated) {
            setSessionComplete(true);
            completeSession();
          }
        }
      }, 150);
    },
    [currentCard, currentCardAlreadyRated, currentIndex, cards.length, studySessionId, cards, id]
  );

  // Navigate previous
  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex((i) => i - 1), 100);
    }
  }, [currentIndex]);

  // Navigate next
  const handleNext = useCallback(() => {
    if (currentIndex < cards.length - 1) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex((i) => i + 1), 100);
    }
  }, [currentIndex, cards.length]);

  // Quit session
  const handleQuit = useCallback(async () => {
    handsFreeRef.current = false;
    setHandsFree(false);
    stopSpeaking();
    cancelRecording();
    await completeSession();
    setStudySessionId(null);
    setSessionComplete(false);
    setCurrentIndex(0);
    setIsFlipped(false);
  }, [studySessionId]);

  // Reset session
  const handleReset = useCallback(() => {
    setCards((prev) => shuffle(prev.map((c) => ({ ...c, sessionRating: null }))));
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionComplete(false);
    setStudySessionId(null);
    startSession();
  }, []);

  // Silent background refetch to reconcile client state with DB
  const refetchCards = async () => {
    try {
      const response = await fetch(`/modules/rune/api/decks/${id}/cards`);
      if (response.ok) {
        const freshCards: CardWithProgress[] = await response.json();
        setCards((prev) => {
          // Preserve sessionRating from existing local state
          const ratingMap = new Map(prev.map((c) => [c.id, c.sessionRating]));
          return freshCards.map((c) => ({
            ...c,
            sessionRating: ratingMap.get(c.id) ?? null,
          }));
        });
      }
    } catch (error) {
      console.error("Error refetching cards:", error);
    }
  };

  // Add a new card
  const handleAddCard = async (front: string, back: string, notes: string | null) => {
    // Client update with temp card
    const tempId = crypto.randomUUID();
    const tempCard = { id: tempId, deck_id: id, front, back, notes, source: "manual", source_id: null, order_index: cards.length, is_disabled: false, created_at: new Date(), modified_at: new Date(), ease_factor: null, interval_days: null, repetitions: null, next_review_at: null, last_reviewed_at: null, sessionRating: null };
    setCards((prev) => [...prev, tempCard as CardWithProgress & { sessionRating: number | null }]);
    setIsAddingCard(false);

    // Background DB insert + refetch to get real ID
    await fetch(`/modules/rune/api/decks/${id}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ front, back, notes }),
    });
    refetchCards();
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
          <Button
            onClick={() => router.push("/modules/rune/ui/decks")}
            className="btn-link !pl-0 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* NOT FOUND MESSAGE */}
          <div className="card">
            <p className="text-secondary text-center py-8">Deck not found</p>
          </div>
        </main>
      </div>
    );
  }

  // NO CARDS
  if (cards.length === 0) {
    return (
      <div className="page">
        <main className="page-container">
          {/* BACK BUTTON */}
          <Button
            onClick={() => router.push("/modules/rune/ui/decks")}
            className="btn-link !pl-0 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* HEADER */}
          <div className="mb-6">
            <h1 className="text-page-title">{deck.name}</h1>
            {deck.description && (
              <p className="text-secondary">{deck.description}</p>
            )}
          </div>

          {/* EMPTY STATE */}
          <div className="card">
            <p className="text-secondary text-center py-8">No cards in this deck</p>
          </div>
        </main>
      </div>
    );
  }

  // PRE-SESSION: deck info + start button
  if (!studySessionId) {
    return (
      <div className="page">
        <main className="page-container" style={{ maxWidth: "36rem" }}>

          {/* BACK BUTTON */}
          <Button
            onClick={() => router.push("/modules/rune/ui/decks")}
            className="btn-link !pl-0 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* DECK INFO */}
          <div className="mb-6">
            <h1 className="text-page-title">{deck.name}</h1>
            {deck.description && (
              <p className="text-secondary">{deck.description}</p>
            )}
          </div>

          {/* STATS */}
          <div className="stat-section mb-6">
            {/* TOTAL CARDS */}
            <div className="stat-card">
              <p className="stat-label">Cards</p>
              <p className="stat-value">{cards.length}</p>
            </div>

            {/* DUE CARDS */}
            <div className="stat-card">
              <p className="stat-label">Due</p>
              <p className="stat-value">
                {cards.filter((c) => !c.next_review_at || new Date(c.next_review_at) <= new Date()).length}
              </p>
            </div>
          </div>

          {/* HANDS-FREE CHECKBOX */}
          <label className="flex items-center gap-2 mb-3 cursor-pointer text-secondary">
            <input
              type="checkbox"
              checked={handsFree}
              onChange={(e) => {
                handsFreeRef.current = e.target.checked;
                setHandsFree(e.target.checked);
              }}
            />
            Hands-free mode
          </label>

          {/* START BUTTON */}
          <Button
            onClick={handsFree ? startHandsFree : startSession}
            className="btn-blue w-full"
            disabled={cards.length === 0}
          >
            Start Study Session
          </Button>

          {/* CARDS SECTION (expandable) */}
          <div className={`card mt-6 ${!cardsExpanded ? "!pb-2" : ""}`}>

            {/* CARD HEADER (toggles expand) */}
            <div
              className={`card-header cursor-pointer ${!cardsExpanded ? "!pb-0" : ""}`}
              onClick={() => setCardsExpanded((v) => !v)}
            >
              <h2 className="text-card-title">
                Cards
              </h2>

              {/* EXPAND CHEVRON */}
              <ChevronDown className={`w-5 h-5 text-secondary transition-transform ${cardsExpanded ? "rotate-180" : ""}`} />
            </div>

            {/* TABLE (visible when expanded) */}
            {cardsExpanded && (<>
              <div className="table-container max-h-[400px] overflow-y-auto">
                <table className="table">
                  <thead className="table-header">
                    <tr className="table-header-row">
                      <th className="table-header-cell w-0">#</th>
                      <th className="table-header-cell">Front</th>
                    </tr>
                  </thead>
                  <tbody className="table-body">

                    {/* EMPTY PLACEHOLDER */}
                    {cards.length === 0 && (
                      <tr className="table-row">
                        <td className="table-empty" colSpan={2}>No cards in this deck</td>
                      </tr>
                    )}

                    {/* CARD ROWS */}
                    {cards.map((card, index) => (
                      <tr key={card.id} className="table-row">
                        <td className="table-cell text-secondary">{index + 1}</td>
                        <td className="table-cell max-w-[200px] truncate">{card.front}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ADD CARD BUTTON */}
              <div className="p-3">
                <Button
                  onClick={() => setIsAddingCard(true)}
                  className="btn-link w-full"
                >
                  <Plus className="w-4 h-4" />
                  Add Card
                </Button>
              </div>
            </>)}
          </div>

          {/* ADD CARD MODAL */}
          <ManageCardModal
            isOpen={isAddingCard}
            onClose={() => setIsAddingCard(false)}
            onAdd={handleAddCard}
          />
        </main>
      </div>
    );
  }

  // SESSION COMPLETE
  if (sessionComplete) {
    const againCount = cards.filter((c) => c.sessionRating === 1).length;
    const hardCount = cards.filter((c) => c.sessionRating === 2).length;
    const goodCount = cards.filter((c) => c.sessionRating === 3).length;
    const easyCount = cards.filter((c) => c.sessionRating === 4).length;

    return (
      <div className="page">
        <main className="page-container" style={{ maxWidth: "36rem" }}>

          {/* SESSION COMPLETE CARD */}
          <div className="card text-center">

            {/* TITLE */}
            <h2 className="text-page-title justify-center mb-2">Session Complete</h2>

            {/* DURATION */}
            <p className="text-secondary mb-6">
              {formatDuration(sessionDurationRef.current)} — {cards.length} cards
            </p>

            {/* RESULTS */}
            <div className="stat-section mb-6">
              {againCount > 0 && (
                <div className="stat-card">
                  <p className="stat-label">Again</p>
                  <p className="stat-value text-alert-red">{againCount}</p>
                </div>
              )}
              {hardCount > 0 && (
                <div className="stat-card">
                  <p className="stat-label">Hard</p>
                  <p className="stat-value text-alert-yellow">{hardCount}</p>
                </div>
              )}
              <div className="stat-card">
                <p className="stat-label">Good</p>
                <p className="stat-value text-alert-green">{goodCount}</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Easy</p>
                <p className="stat-value text-alert-blue">{easyCount}</p>
              </div>
            </div>

            {/* ACTIONS */}
            <div className="flex gap-3">
              {/* BACK TO DECKS */}
              <Button
                onClick={() => router.push("/modules/rune/ui/decks")}
                className="btn-off flex-1"
              >
                Back to Decks
              </Button>

              {/* STUDY AGAIN */}
              <Button
                onClick={handleReset}
                className="btn-blue flex-1"
              >
                Study Again
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ACTIVE STUDY SESSION
  return (
    <div className="page">

      <Toaster />

      <main className="page-container" style={{ maxWidth: "36rem" }}>

        {/* HIDDEN AUDIO ELEMENT FOR TTS */}
        <audio ref={audioRef} preload="none" />

        {/* SESSION HEADER */}
        <div className="flex items-center justify-between mb-2">

          {/* DECK NAME + HANDS-FREE TOGGLE */}
          <div className="flex items-center gap-3">
            <p className="text-subtle">{deck.name}</p>
            <label className="flex items-center gap-1 cursor-pointer text-subtle text-xs">
              <input
                type="checkbox"
                checked={handsFree}
                onChange={(e) => {
                  handsFreeRef.current = e.target.checked;
                  setHandsFree(e.target.checked);
                }}
              />
              Hands-free
            </label>
          </div>

          {/* QUIT BUTTON */}
          <Button
            onClick={handleQuit}
            className="btn-link"
            title="Quit session"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* PROGRESS INFO */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-subtle">
            CARD {currentIndex + 1} / {cards.length}
          </span>
          <span className="text-subtle flex gap-2">
            <span className="text-alert-green">{cards.filter((c) => c.sessionRating === 4).length} easy</span>
            <span className="text-alert-green">{cards.filter((c) => c.sessionRating === 3).length} good</span>
            <span className="text-alert-yellow">{cards.filter((c) => c.sessionRating === 2).length} hard</span>
            <span className="text-alert-red">{cards.filter((c) => c.sessionRating === 1).length} again</span>
          </span>
        </div>

        {/* PROGRESS BAR */}
        <div className="flashcard-progress-bar mb-5">
          {cards.map((card, i) => (
            <div
              key={card.id}
              className={`flashcard-progress-segment ${card.sessionRating !== null
                ? ratingToSegmentClass(card.sessionRating)
                : i === currentIndex
                  ? "flashcard-progress-segment-active"
                  : ""
                }`}
            />
          ))}
        </div>

        {(
          <>
            {/* FLASH CARD */}
            <div className="flashcard-container" onClick={handleFlip}>
              {!isFlipped ? (
                <>
                  {/* FRONT FACE */}
                  <div className="flex items-center justify-between w-full">
                    <div className="badge-gray">QUESTION</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isSpeaking) { stopSpeaking(); disableHandsFree(); }
                        else { handleSpeakAndRecord(); }
                      }}
                      className="text-subtle hover:text-primary transition-colors cursor-pointer"
                      title={isSpeaking ? "Stop speaking" : "Speak question"}
                    >
                      {isSpeaking ? <CircleStop className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* QUESTION TEXT */}
                  <div className="text-primary mt-4 flex-1">{currentCard.front}</div>

                  {/* TAP HINT */}
                  <div className="text-subtle">TAP TO REVEAL</div>
                </>
              ) : (
                <>
                  {/* BACK FACE */}
                  <div className="flex items-center justify-between w-full">
                    <div className="badge-gray">ANSWER</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isSpeaking) { stopSpeaking(); disableHandsFree(); }
                        else if (currentCard) { speakQuestion(currentCard.back); }
                      }}
                      className="text-subtle hover:text-primary transition-colors cursor-pointer"
                      title={isSpeaking ? "Stop speaking" : "Speak answer"}
                    >
                      {isSpeaking ? <CircleStop className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* ANSWER TEXT */}
                  <div className="text-primary mt-4 flex-1">{currentCard.back}</div>

                  {/* NOTES */}
                  {currentCard.notes && (
                    <div className="text-subtle-italic">{currentCard.notes}</div>
                  )}
                </>
              )}
            </div>

            {/* RECORD BUTTON */}
            <Button
              onClick={isRecording ? () => { stopRecording(); disableHandsFree(); } : () => { setEvaluationResult(null); startRecording(); }}
              disabled={isSpeaking || isTranscribing}
              className={`${isRecording ? "btn-red" : "btn-off"} w-full mt-3`}
            >
              {isRecording ? (
                <><Square className="w-4 h-4" /> Stop</>
              ) : (
                <><Mic className="w-4 h-4" /> {isTranscribing ? "Transcribing..." : "Record"}</>
              )}
            </Button>

            {/* TRANSCRIPT */}
            {transcript && (
              <div className="card mt-3">
                <div className="flex items-center justify-between">
                  <p className="text-subtle text-xs">YOUR ANSWER</p>
                  <button
                    onClick={() => {
                      if (isSpeaking) { stopSpeaking(); disableHandsFree(); }
                      else { speakQuestion(transcript); }
                    }}
                    className="text-subtle hover:text-primary transition-colors cursor-pointer"
                    title={isSpeaking ? "Stop speaking" : "Speak transcript"}
                  >
                    {isSpeaking ? <CircleStop className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-primary mt-1">{transcript}</p>
              </div>
            )}

            {/* EVALUATE BUTTON */}
            {transcript && !evaluationResult && (
              <Button
                onClick={handleEvaluate}
                disabled={isEvaluating}
                className="btn-blue w-full mt-3 py-4 text-lg"
              >
                <BrainCircuit className="w-5 h-5" />
                {isEvaluating ? "Evaluating..." : "Evaluate Answer"}
              </Button>
            )}

            {/* EVALUATION RESULT */}
            {evaluationResult && (
              <div className={`alert-${evaluationResult.correct ? "green" : "red"} mt-3`}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{evaluationResult.correct ? "Correct" : "Incorrect"}</p>
                  <button
                    onClick={() => {
                      if (isSpeaking) { stopSpeaking(); disableHandsFree(); }
                      else { speakQuestion(evaluationResult.explanation); }
                    }}
                    className="text-inherit opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                    title={isSpeaking ? "Stop speaking" : "Speak evaluation"}
                  >
                    {isSpeaking ? <CircleStop className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-sm mt-1">{evaluationResult.explanation}</p>
              </div>
            )}

            {/* RATING BUTTONS — only visible when flipped and not yet rated */}
            {isFlipped && !currentCardAlreadyRated && (
              <div className="flex gap-2 mt-5">
                {[
                  { rating: 1, label: "AGAIN", className: "alert-red" },
                  { rating: 2, label: "HARD", className: "alert-yellow" },
                  { rating: 3, label: "GOOD", className: "alert-green" },
                  { rating: 4, label: "EASY", className: "alert-blue" },
                ].map(({ rating, label, className }) => (
                  <button
                    key={rating}
                    onClick={(e) => { e.stopPropagation(); handleRate(rating); }}
                    className={`${className} cursor-pointer text-center flex-1 ${evaluationResult?.suggestedRating === rating ? "ring-2 ring-offset-2 ring-current" : ""}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* RATED INDICATOR */}
            {isFlipped && currentCardAlreadyRated && currentCard.sessionRating !== null && (
              <div className="text-secondary text-center mt-5">Rated: {ratingToLabel(currentCard.sessionRating)}</div>
            )}

            {/* NAVIGATION */}
            <div className="flex gap-2 mt-3">

              {/* PREV BUTTON */}
              <Button
                onClick={handlePrev}
                disabled={currentIndex === 0 || isRecording || isTranscribing}
                className="btn-off flex-1"
              >
                <ChevronLeft className="w-4 h-4" />
                PREV
              </Button>

              {/* NEXT BUTTON */}
              <Button
                onClick={handleNext}
                disabled={currentIndex >= cards.length - 1 || isRecording || isTranscribing}
                className="btn-off flex-1"
              >
                NEXT
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
