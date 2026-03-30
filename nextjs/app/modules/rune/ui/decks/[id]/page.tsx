"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, X, ChevronLeft, ChevronRight, Volume2, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Deck } from "../../../types/deck";
import { CardWithProgress } from "../../../types/card";
import { useSpeaker } from "../../../lib/voice/useSpeaker";
import { useListener } from "../../../lib/voice/useListener";

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
  const { isRecording, isTranscribing, transcript, startRecording, stopRecording, clearTranscript } = useListener();

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
    stopSpeaking();
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

          {/* START BUTTON */}
          <Button
            onClick={startSession}
            className="btn-blue w-full"
          >
            Start Study Session
          </Button>
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
      <main className="page-container" style={{ maxWidth: "36rem" }}>

        {/* HIDDEN AUDIO ELEMENT FOR TTS */}
        <audio ref={audioRef} preload="none" />

        {/* SESSION HEADER */}
        <div className="flex items-center justify-between mb-2">

          {/* DECK NAME */}
          <div>
            <p className="text-subtle">{deck.name}</p>
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
                  <div className="badge-gray self-start">QUESTION</div>

                  {/* QUESTION TEXT */}
                  <div className="text-primary mt-4 flex-1">{currentCard.front}</div>

                  {/* TAP HINT */}
                  <div className="text-subtle">TAP TO REVEAL</div>
                </>
              ) : (
                <>
                  {/* BACK FACE */}
                  <div className="badge-gray self-start">ANSWER</div>

                  {/* ANSWER TEXT */}
                  <div className="text-primary mt-4 flex-1">{currentCard.back}</div>

                  {/* NOTES */}
                  {currentCard.notes && (
                    <div className="text-subtle-italic">{currentCard.notes}</div>
                  )}
                </>
              )}
            </div>

            {/* SPEAK / RECORD BUTTONS */}
            <div className="flex gap-2 mt-3">
              {/* SPEAK BUTTON */}
              <Button
                onClick={() => currentCard && speakQuestion(currentCard.front)}
                disabled={isSpeaking || isRecording}
                className="btn-off flex-1"
              >
                <Volume2 className="w-4 h-4" />
                {isSpeaking ? "Speaking..." : "Speak"}
              </Button>

              {/* RECORD BUTTON */}
              <Button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isSpeaking || isTranscribing}
                className={`${isRecording ? "btn-red" : "btn-off"} flex-1`}
              >
                {isRecording ? (
                  <><Square className="w-4 h-4" /> Stop</>
                ) : (
                  <><Mic className="w-4 h-4" /> {isTranscribing ? "Transcribing..." : "Record"}</>
                )}
              </Button>
            </div>

            {/* TRANSCRIPT */}
            {transcript && (
              <div className="card mt-3">
                <p className="text-subtle text-xs mb-1">YOUR ANSWER</p>
                <p className="text-primary">{transcript}</p>
              </div>
            )}

            {/* RATING BUTTONS — only visible when flipped and not yet rated */}
            {isFlipped && !currentCardAlreadyRated && (
              <div className="flex gap-2 mt-5">
                <button onClick={(e) => { e.stopPropagation(); handleRate(1); }} className="alert-red cursor-pointer text-center flex-1">AGAIN</button>
                <button onClick={(e) => { e.stopPropagation(); handleRate(2); }} className="alert-yellow cursor-pointer text-center flex-1">HARD</button>
                <button onClick={(e) => { e.stopPropagation(); handleRate(3); }} className="alert-green cursor-pointer text-center flex-1">GOOD</button>
                <button onClick={(e) => { e.stopPropagation(); handleRate(4); }} className="alert-blue cursor-pointer text-center flex-1">EASY</button>
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
                disabled={currentIndex === 0}
                className="btn-off flex-1"
              >
                <ChevronLeft className="w-4 h-4" />
                PREV
              </Button>

              {/* NEXT BUTTON */}
              <Button
                onClick={handleNext}
                disabled={currentIndex >= cards.length - 1}
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
