"use client";

import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { X, ChevronLeft, ChevronRight, Volume2, CircleStop, Mic, Square, BrainCircuit, Pencil, Layers, History } from "lucide-react";
import { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import HelpButton from "@/components/ui/HelpButton";
import { generateUUID } from "@/lib/uuid";
import { CardWithProgress, CardReview } from "../types/card";
import { useSpeaker } from "../lib/voice/useSpeaker";
import { useListener } from "../lib/voice/useListener";
import type { EvaluationResult } from "../lib/voice/evaluationFunctions";
import { playEvaluationChime } from "../lib/evaluationChime";
import { preloadCardImages } from "../lib/imagePreload";
import CardContent from "./CardContent";
import CardHistoryPanel from "./CardHistoryPanel";
import ManageCardModal from "../ui/decks/[id]/cards/ManageCardModal";

// The one study engine, shared by single-deck study and collection study. Everything
// deck-specific is a prop: the caller supplies the due cards and the API base the
// session rows/reviews hang off (`/modules/rune/api/decks/<id>` or
// `/modules/rune/api/collections/<id>`), so a collection session spanning several
// decks behaves identically to a single-deck one.

enum SpeakingSource {
  Question,
  CardAnswer,
  Evaluation,
}

// How many cards ahead of the current one to keep TTS audio warmed in the
// background (see the preload effect below).
const TTS_PRELOAD_BUFFER = 1;

// How many cards ahead to warm inline images (and measure their dimensions) so
// the next card's picture is already cached and correctly sized when reached.
const IMAGE_PRELOAD_BUFFER = 1;

// How many cards ahead to fetch rating history for. The history section only
// appears once the answer is revealed, but the fetch is started as soon as the
// card is in view (and one card early), so flipping never shows a spinner.
const HISTORY_PRELOAD_BUFFER = 1;

// Ratings the in-session history table shows before its "Show all" toggle. Five
// is enough to see the recent run without the section pushing the rating buttons
// and navigation off a phone screen.
const HISTORY_COLLAPSED_ROWS = 5;

// Study preferences from rune_settings, loaded once by the page that hosts the
// session (the same values also drive its landing screen).
export interface StudyPreferences {
  autoAdvanceOnEvaluate: boolean;
  autoAdvanceSeconds: number;
  evaluationSoundEnabled: boolean;
  dailyGoal: number;
  dailyMaxRenew: number;
  // Distinct cards reviewed today across ALL decks, as of page load. Live count =
  // this baseline + cards rated in the running session.
  reviewedTodayBaseline: number;
}

type StudyCard = CardWithProgress & { sessionRating: number | null };

interface StudySessionProps {
  // False while the host page shows its own landing screen: the component renders
  // nothing but keeps warming TTS/images for the first card, so "Start" is instant.
  isActive: boolean;
  // Deck or collection name, shown in the session header.
  sourceName: string;
  // POST {base}/study creates the session row; POST/PUT {base}/study/review records
  // reviews and completes it.
  studyApiBase: string;
  // Page path the ?card=<id> reflection is written against.
  cardUrlBase: string;
  // Due cards for this session, unshuffled — shuffling is session state.
  cards: CardWithProgress[];
  handsFree: boolean;
  onHandsFreeChange: (handsFree: boolean) => void;
  preferences: StudyPreferences;
  existingCategories: string[];
  // Re-fetches the host page's cards and returns the fresh list, so the running
  // session can reconcile without owning the fetch.
  onRefetchCards: () => Promise<CardWithProgress[]>;
  // Leaves the session UI — the host page returns to its landing screen.
  onQuit: () => void;
  // Navigates away from the Session Complete screen.
  onExit: () => void;
  exitLabel: string;
}

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

export default function StudySession({
  isActive,
  sourceName,
  studyApiBase,
  cardUrlBase,
  cards,
  handsFree,
  onHandsFreeChange,
  preferences,
  existingCategories,
  onRefetchCards,
  onQuit,
  onExit,
  exitLabel,
}: StudySessionProps) {
  const router = useRouter();

  // DATA
  const [sessionCards, setSessionCards] = useState<StudyCard[]>([]);

  // STATE
  const [studySessionId, setStudySessionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const { isSpeaking, preloadQuestion, speakQuestion, stopSpeaking, audioRef } = useSpeaker();
  const { isRecording, isTranscribing, transcript, startRecording, stopRecording, cancelRecording, clearTranscript } = useListener();
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [answerModified, setAnswerModified] = useState(false); // true when userAnswer changed since last evaluation
  const [autoRateCountdown, setAutoRateCountdown] = useState(false);
  const [speakingSource, setSpeakingSource] = useState<SpeakingSource | null>(null); // tracks which button triggered TTS
  const [editingCard, setEditingCard] = useState<StudyCard | null>(null);
  // Rating history per card id, filled in by the preload below. A missing entry means
  // "not here yet" (loading); an entry in cardHistoryFailed means the fetch failed.
  const [cardHistory, setCardHistory] = useState<Record<string, CardReview[]>>({});
  const [cardHistoryFailed, setCardHistoryFailed] = useState<Record<string, boolean>>({});
  // Card ids whose history has been requested, so the buffer never fires a second
  // fetch for a card it already warmed (or is mid-flight on).
  const historyRequestedRef = useRef<Set<string>>(new Set());
  const handsFreeRef = useRef(handsFree); // Ref to track hands-free in async callbacks

  // Refs for duration tracking
  const sessionStartRef = useRef<number>(0);
  const sessionDurationRef = useRef<number>(0);

  // Wake Lock ref for hands-free mode
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Ephemeral key identifying this study session's persistent eval worker (see
  // evalWorker.ts). Generated at study start, sent with warm/evaluate/dispose so
  // the server reuses one warmed Claude process for every card's evaluation.
  const evalSessionKeyRef = useRef<string | null>(null);

  // Tracks the isActive edge so the session initializes exactly once per start.
  const wasActiveRef = useRef(false);

  // Derived
  const currentCard = sessionCards[currentIndex] || null;
  const currentCardAlreadyRated = currentCard?.sessionRating !== null;

  // The current card's rating history, as warmed by the preload buffer. Undefined
  // until the fetch resolves — with the buffer doing its job that window has already
  // passed by the time the answer is revealed, so the spinner is rarely seen.
  const currentCardHistory = currentCard ? cardHistory[currentCard.id] : undefined;
  const currentCardHistoryFailed = currentCard ? !!cardHistoryFailed[currentCard.id] : false;

  // Soft daily-target progress. Live count = today's baseline + cards rated this
  // session. Both thresholds are soft — goalMet is motivational, overMaxRenew only
  // warns; neither hides or blocks any due card.
  const ratedThisSession = sessionCards.filter((c) => c.sessionRating !== null).length;
  const reviewedToday = preferences.reviewedTodayBaseline + ratedThisSession;
  const goalMet = reviewedToday >= preferences.dailyGoal;
  const overMaxRenew = reviewedToday >= preferences.dailyMaxRenew;

  // Keep the async-callback ref in step with the controlled prop.
  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  // Seed the session queue from the host page's due cards while idle. Once the
  // session is running the queue is owned here — its order and per-card
  // sessionRating are session state and must survive parent re-renders.
  useEffect(() => {
    if (isActive) return;
    setSessionCards(cards.map((c) => ({ ...c, sessionRating: null })));
  }, [cards, isActive]);

  // Acquire/release Wake Lock when hands-free mode changes
  useEffect(() => {
    if (handsFree && isActive) {
      navigator.wakeLock?.request("screen")
        .then((lock) => { wakeLockRef.current = lock; })
        .catch(() => {}); // Silent fail — not all browsers support Wake Lock
    } else if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }

    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [handsFree, isActive]);

  // Reflect the currently-viewed card in the URL (?card=<id>) while studying,
  // so the card being shown is directly observable/shareable instead of only
  // living in client state. Replace (not push) to avoid polluting history on
  // every card change.
  useEffect(() => {
    const url = isActive && currentCard
      ? `${cardUrlBase}?card=${currentCard.id}`
      : cardUrlBase;
    router.replace(url, { scroll: false });
  }, [isActive, currentCard?.id, cardUrlBase]);

  // Preload TTS audio, keeping a rolling buffer ahead of wherever the user
  // actually is. Piper synthesis (see ttsFunctions.ts) is a real cost — a
  // subprocess spawn + disk round-trip per call — so hands-free mode's
  // auto-speak feels slow if it's waiting on a cold fetch. Two cases:
  //   - Before the session starts (isActive false): warm just the first due
  //     card in the background as soon as it's fetched, so the very first
  //     "Start Study Session" click already has audio ready instead of
  //     starting the fetch only once hands-free speaks.
  //   - During the session: keep TTS_PRELOAD_BUFFER card(s) ahead of
  //     currentIndex warmed as the user advances. useSpeaker's cache is keyed
  //     by text, not position, so this is safe to re-run on every index change
  //     — already-cached entries are just no-ops.
  useEffect(() => {
    if (sessionCards.length === 0) return;
    if (!isActive) {
      preloadQuestion(sessionCards[0].front);
      return;
    }
    for (let i = currentIndex; i <= currentIndex + TTS_PRELOAD_BUFFER && i < sessionCards.length; i++) {
      preloadQuestion(sessionCards[i].front);
    }
  }, [sessionCards, isActive, currentIndex]);

  // Warm inline images the same way TTS audio is warmed: before the session,
  // preload the first card's images so its picture is ready the moment study
  // starts; during the session, keep IMAGE_PRELOAD_BUFFER card(s) ahead of
  // currentIndex loaded (and measured) so advancing shows the next card's image
  // instantly and correctly sized. The cache dedupes, so re-runs are cheap.
  useEffect(() => {
    if (sessionCards.length === 0) return;
    if (!isActive) {
      preloadCardImages([sessionCards[0].front, sessionCards[0].back, sessionCards[0].notes]);
      return;
    }
    for (let i = currentIndex; i <= currentIndex + IMAGE_PRELOAD_BUFFER && i < sessionCards.length; i++) {
      preloadCardImages([sessionCards[i].front, sessionCards[i].back, sessionCards[i].notes]);
    }
  }, [sessionCards, isActive, currentIndex]);

  // Fetch one card's rating history into the cache, once. Deck-scoped by the CARD's
  // own deck_id rather than the session source — in a collection session the card can
  // belong to any member deck, and the reviews route hangs off its deck.
  const preloadCardHistory = useCallback((card: StudyCard | undefined) => {
    if (!card || historyRequestedRef.current.has(card.id)) return;
    historyRequestedRef.current.add(card.id);

    fetch(`/modules/rune/api/decks/${card.deck_id}/cards/${card.id}/reviews`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Reviews request failed: ${response.status}`);
        const data = await response.json();
        // Guard against an { error } envelope being stored as the list.
        if (!Array.isArray(data)) throw new Error("Unexpected reviews payload");
        setCardHistory((prev) => ({ ...prev, [card.id]: data }));
      })
      .catch((error) => {
        console.error("Error preloading card review history:", error);
        // Drop the claim so revisiting the card (PREV, or a skip that requeues it)
        // gets another attempt rather than being stuck on the failure forever.
        historyRequestedRef.current.delete(card.id);
        setCardHistoryFailed((prev) => ({ ...prev, [card.id]: true }));
      });
  }, []);

  // Warm rating history the same way TTS audio and images are warmed, and for the same
  // reason: the history section renders only once the answer is revealed, so fetching it
  // at flip time would put a spinner under every card. Before the session, warm the first
  // card; during it, keep HISTORY_PRELOAD_BUFFER card(s) ahead of currentIndex loaded.
  // Already-cached ids are no-ops, so re-running on every index change is cheap.
  useEffect(() => {
    if (sessionCards.length === 0) return;
    if (!isActive) {
      preloadCardHistory(sessionCards[0]);
      return;
    }
    for (let i = currentIndex; i <= currentIndex + HISTORY_PRELOAD_BUFFER && i < sessionCards.length; i++) {
      preloadCardHistory(sessionCards[i]);
    }
  }, [sessionCards, isActive, currentIndex, preloadCardHistory]);

  // Stop recording and clear state when card changes. Keyed on currentCard?.id (not just
  // currentIndex) because handleSkip reorders the queue without moving currentIndex — the
  // card AT that index changes even though the number doesn't.
  useEffect(() => {
    cancelRecording();
    stopSpeakingTracked();
    clearTranscript();
    setEvaluationResult(null);
    setUserAnswer("");
    setAnswerModified(false);
  }, [currentIndex, currentCard?.id]);

  // Hands-free auto-loop: speak question, then auto-record
  useEffect(() => {
    if (!handsFreeRef.current || !isActive || !currentCard) return;

    let cancelled = false;

    const runHandsFree = async () => {
      // Speak the question
      await speakFrom(SpeakingSource.Question, currentCard.front);
      if (cancelled || !handsFreeRef.current) return;

      // Auto-start recording after TTS finishes
      try {
        await startRecording();
      } catch {
        // Mic permission denied — disable hands-free
        disableHandsFree();
      }
    };

    runHandsFree();

    return () => { cancelled = true; };
  }, [currentIndex, currentCard?.id, isActive]);

  // Inject transcript into free response field and auto-evaluate in hands-free mode
  useEffect(() => {
    if (!transcript) return;
    setUserAnswer(transcript);
    if (handsFreeRef.current) {
      handleEvaluate(transcript);
    }
  }, [transcript]);

  // Auto-speak evaluation result in hands-free mode, then auto-rate after the delay
  useEffect(() => {
    if (!handsFreeRef.current || !evaluationResult) return;

    let rateTimer: ReturnType<typeof setTimeout>;

    const run = async () => {
      // Easy answers return a blank explanation — skip TTS entirely and go straight to the
      // countdown; the evaluation chime is the only feedback needed.
      if (evaluationResult.explanation?.trim()) {
        await speakFrom(SpeakingSource.Evaluation, evaluationResult.explanation);
      }
      if (!handsFreeRef.current) return;

      // Start countdown, then auto-rate with suggested rating — or auto-skip if the
      // answer wasn't a genuine attempt (garbled/unrelated/empty), so it doesn't get
      // counted as an Again against the card.
      setAutoRateCountdown(true);
      rateTimer = setTimeout(() => {
        setAutoRateCountdown(false);
        if (handsFreeRef.current) {
          if (evaluationResult.suggestedRating === 0) {
            handleSkip();
          } else {
            handleRate(evaluationResult.suggestedRating);
          }
        }
      }, preferences.autoAdvanceSeconds * 1000);
    };

    run();

    return () => {
      setAutoRateCountdown(false);
      clearTimeout(rateTimer);
    };
  }, [evaluationResult]);

  // Manual auto-advance: outside hands-free, when the user has opted in, accept the
  // AI-suggested rating and move on after the configured delay — like hands-free's
  // auto-rate, minus the voice loop, so a plain typed/tapped "Evaluate" self-advances.
  // Scoped to Easy only: it fires solely when the answer was judged Easy (rating 4).
  // Anything less (Good/Hard/Again/unscorable) waits for a manual rating, so the
  // auto path never silently accepts a shaky answer.
  useEffect(() => {
    if (handsFreeRef.current) return; // hands-free runs its own auto-rate timer above
    if (!preferences.autoAdvanceOnEvaluate || !evaluationResult || currentCardAlreadyRated) return;
    if (evaluationResult.suggestedRating !== 4) return; // Easy only

    setAutoRateCountdown(true);
    const rateTimer = setTimeout(() => {
      setAutoRateCountdown(false);
      handleRate(evaluationResult.suggestedRating);
    }, preferences.autoAdvanceSeconds * 1000);

    return () => {
      setAutoRateCountdown(false);
      clearTimeout(rateTimer);
    };
  }, [evaluationResult, preferences.autoAdvanceOnEvaluate, preferences.autoAdvanceSeconds, currentCardAlreadyRated]);

  // Enter the study UI when the host page flips isActive. Does NOT create a DB
  // session row — that happens lazily on the first rated card (see
  // ensureStudySession), so browsing cards without rating any leaves no dangling
  // study_sessions row behind.
  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      startSession();
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  // Disable hands-free mode (used when user manually interrupts)
  const disableHandsFree = () => {
    handsFreeRef.current = false;
    onHandsFreeChange(false);
    setAutoRateCountdown(false); // clear countdown animation
  };

  // Speak with source tracking so only the active button shows stop icon
  const speakFrom = async (source: SpeakingSource, text: string) => {
    setSpeakingSource(source);
    await speakQuestion(text);
    setSpeakingSource(null);
  };

  // Stop speaking and clear source
  const stopSpeakingTracked = () => {
    stopSpeaking();
    setSpeakingSource(null);
  };

  // Speak the question, then auto-record if hands-free is on
  const handleSpeakAndRecord = async () => {
    if (!currentCard) return;
    await speakFrom(SpeakingSource.Question, currentCard.front);
    if (!handsFreeRef.current) return;

    try {
      await startRecording();
    } catch {
      disableHandsFree();
    }
  };

  // Evaluate the user's answer against the expected answer
  const handleEvaluate = async (answerOverride?: string) => {
    const answer = (answerOverride ?? userAnswer).trim();
    if (!currentCard || !answer) return;
    // A card with no answer has nothing to grade against — the LLM would be scoring
    // against an empty string. Just reveal the face and let the user self-rate instead of
    // asking for a meaningless verdict.
    if (!currentCard.back.trim()) { setIsFlipped(true); return; }

    setIsEvaluating(true);
    try {
      const response = await fetch(`/modules/rune/api/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: currentCard.front,
          expectedAnswer: currentCard.back,
          userAnswer: answer,
          notes: currentCard.notes,
          sessionKey: evalSessionKeyRef.current, // route to this session's warmed worker
        }),
      });

      if (!response.ok) {
        console.error("Evaluation failed");
        return;
      }

      const result: EvaluationResult = await response.json();
      setEvaluationResult(result);
      setAnswerModified(false);

      // Play a pleasant chime pitched to the evaluated rating (opt-out via settings).
      if (preferences.evaluationSoundEnabled) playEvaluationChime(result.suggestedRating);

      // Reveal the answer
      setIsFlipped(true);
    } catch (error) {
      console.error("Evaluation error:", error);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Shuffle the queue and start the clock. Also spins up + pre-warms this session's
  // persistent eval worker now, so its ~3s Claude startup overlaps the first card's
  // question TTS and the first real evaluation runs on the fast warm path.
  const startSession = () => {
    setSessionCards((prev) => shuffle(prev));
    sessionStartRef.current = Date.now();

    const key = generateUUID();
    evalSessionKeyRef.current = key;
    fetch(`/modules/rune/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warm: true, sessionKey: key }),
    }).catch(() => { /* best-effort warm; first eval will just pay startup */ });
  };

  // Tear down this session's eval worker (best-effort). Safe to call repeatedly.
  const disposeEvalWorker = useCallback(() => {
    const key = evalSessionKeyRef.current;
    if (!key) return;
    evalSessionKeyRef.current = null;
    fetch(`/modules/rune/api/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dispose: true, sessionKey: key }),
      keepalive: true, // allow the request to outlive an unmount/navigation
    }).catch(() => { /* idle timeout on the server will reap it anyway */ });
  }, []);

  // Reap this session's eval worker on SPA navigation away (React unmount) AND on
  // a hard refresh / tab close (pagehide → sendBeacon, since unmount cleanup is
  // unreliable there). The server's idle timeout is the final backstop if both miss.
  useEffect(() => {
    const beaconDispose = () => {
      const key = evalSessionKeyRef.current;
      if (!key || !navigator.sendBeacon) return;
      const blob = new Blob([JSON.stringify({ dispose: true, sessionKey: key })], { type: "application/json" });
      navigator.sendBeacon(`/modules/rune/api/evaluate`, blob);
      evalSessionKeyRef.current = null;
    };
    window.addEventListener("pagehide", beaconDispose);
    return () => {
      window.removeEventListener("pagehide", beaconDispose);
      disposeEvalWorker(); // SPA unmount
    };
  }, [disposeEvalWorker]);

  // Get the current study session ID, creating the DB row on first use.
  const ensureStudySession = useCallback(async (): Promise<string | null> => {
    if (studySessionId) return studySessionId;
    try {
      const response = await fetch(`${studyApiBase}/study`, { method: "POST" });
      if (response.ok) {
        const data = await response.json();
        setStudySessionId(data.sessionId);
        return data.sessionId;
      }
    } catch (error) {
      console.error("Error starting study session:", error);
    }
    return null;
  }, [studySessionId, studyApiBase]);

  // Complete the study session
  const completeSession = async () => {
    // Track elapsed time even if no card was ever rated (no DB session row exists yet
    // in that case — see ensureStudySession) — otherwise finishing an unrated session
    // shows a stale "0s" on the Session Complete screen regardless of time spent.
    sessionDurationRef.current = Date.now() - sessionStartRef.current;
    disposeEvalWorker(); // done grading — release the persistent worker
    if (!studySessionId) return;
    const durationSeconds = Math.floor(sessionDurationRef.current / 1000);
    try {
      await fetch(`${studyApiBase}/study/review`, {
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
      if (!currentCard) return;

      // Update local state
      setSessionCards((prev) =>
        prev.map((c) =>
          c.id === currentCard.id ? { ...c, sessionRating: rating } : c
        )
      );

      // Keep the card's own rating history in step with the rating just given, so
      // stepping back to it with PREV (or meeting it again after a skip) shows the
      // rating rather than the history as it stood before. Optimistic for the same
      // reason the advance below is: the review POST is fire-and-forget, so refetching
      // here would race it. If the history hasn't arrived yet there is nothing to
      // append to — release the fetch claim instead, so the card is refetched the next
      // time the buffer reaches it, by which point the POST has landed.
      if (cardHistory[currentCard.id]) {
        const optimisticReview: CardReview = {
          id: generateUUID(),
          rating,
          response_time_ms: null,
          created_at: new Date(),
          study_session_id: studySessionId ?? "",
        };
        setCardHistory((prev) => ({
          ...prev,
          [currentCard.id]: [optimisticReview, ...(prev[currentCard.id] ?? [])],
        }));
      } else {
        historyRequestedRef.current.delete(currentCard.id);
      }

      // Submit review to API — fire-and-forget so card advance below isn't gated on the
      // network round-trip; a lost review just means the card's SRS interval doesn't move.
      // The DB session row is created lazily here, on the first rated card, rather than
      // eagerly on "Start Study Session" — so browsing without rating anything leaves no
      // dangling study_sessions row.
      ensureStudySession()
        .then((sessionId) => {
          if (!sessionId) return;
          return fetch(`${studyApiBase}/study/review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cardId: currentCard.id,
              studySessionId: sessionId,
              rating,
              responseTimeMs: null,
            }),
          }).then((response) => {
            if (!response.ok) console.error("Failed to submit review:", response.status);
          });
        })
        .catch((error) => console.error("Error submitting review:", error));

      // Advance to next card after brief delay
      setIsFlipped(false);
      setTimeout(() => {
        if (currentIndex < sessionCards.length - 1) {
          setCurrentIndex((i) => i + 1);
        } else {
          // Check if all cards in the session queue are rated
          const allRated = sessionCards.every(
            (c) => c.id === currentCard.id || c.sessionRating !== null
          );
          if (allRated) {
            setSessionComplete(true);
            completeSession();
          }
        }
      }, 150);
    },
    [currentCard, currentIndex, sessionCards, ensureStudySession, studyApiBase, cardHistory, studySessionId]
  );

  // Skip a card without rating it — no review is submitted, so it doesn't touch SRS
  // scheduling, session accuracy, or history. Moves the card to the end of the queue
  // (currentIndex is left unchanged, so the shift naturally brings the next card into
  // view) so it resurfaces later this same session instead of being lost or dropped.
  const handleSkip = useCallback(() => {
    if (!currentCard) return;
    const skippedId = currentCard.id;

    // If every other card is already rated, this is the last unrated card — moving it
    // to the end of the queue would land it right back in the same spot, so the button
    // would look like it did nothing forever. End the session instead; the card stays
    // due for next time since it was never actually reviewed.
    const isLastUnratedCard = sessionCards.every((c) => c.id === skippedId || c.sessionRating !== null);
    if (isLastUnratedCard) {
      setSessionComplete(true);
      completeSession();
      return;
    }

    setIsFlipped(false);
    setSessionCards((prev) => {
      const idx = prev.findIndex((c) => c.id === skippedId);
      if (idx === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.push(moved); // sessionRating stays null — never counted as a rating
      return next;
    });
  }, [currentCard, sessionCards]);

  // Navigate previous
  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex((i) => i - 1), 100);
    }
  }, [currentIndex]);

  // Navigate next. If an AI evaluation suggested a rating for the current card and it
  // hasn't been rated yet, moving on accepts that suggestion — the highlighted rating
  // button isn't just a hint, it's the default outcome unless the user picks another.
  // A suggestedRating of 0 (garbled/unrelated/empty) skips instead of accepting Again.
  const handleNext = useCallback(() => {
    if (evaluationResult && !currentCardAlreadyRated) {
      if (evaluationResult.suggestedRating === 0) {
        handleSkip();
      } else {
        handleRate(evaluationResult.suggestedRating);
      }
      return;
    }
    if (currentIndex < sessionCards.length - 1) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex((i) => i + 1), 100);
    } else {
      // Last card, nothing to accept, and nowhere further to advance — the only
      // remaining option is to finish. Every other card is guaranteed already
      // rated by the time currentIndex reaches the end (see handleSkip's
      // isLastUnratedCard check), so this never cuts a session short mid-deck.
      setIsFlipped(false);
      setSessionComplete(true);
      completeSession();
    }
  }, [currentIndex, sessionCards.length, evaluationResult, currentCardAlreadyRated, handleRate, handleSkip]);

  // Quit session — hand control back to the host page's landing screen.
  const handleQuit = useCallback(async () => {
    disableHandsFree();
    stopSpeakingTracked();
    cancelRecording();
    await completeSession();
    setStudySessionId(null);
    setSessionComplete(false);
    setCurrentIndex(0);
    setIsFlipped(false);
    onQuit();
  }, [studySessionId, onQuit]);

  // Reset session
  const handleReset = useCallback(() => {
    setSessionCards((prev) => shuffle(prev.map((c) => ({ ...c, sessionRating: null }))));
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionComplete(false);
    setStudySessionId(null);
    startSession();
  }, []);

  // Silent background refetch to reconcile the running queue with the DB.
  const reconcileCards = async () => {
    try {
      const freshCards = await onRefetchCards();
      if (!freshCards) return;

      setSessionCards((prev) => {
        // Map over ALL fresh cards, not just currently-due ones. A card
        // already rated earlier in this session is no longer "due" (its
        // next_review_at just moved to the future) — but it must stay in
        // the array or currentIndex desyncs from what's on screen. Due-ness
        // only matters for deciding which NEW cards to admit into the
        // session below; it must never be used to evict cards already in it.
        const freshById = new Map(freshCards.map((c) => [c.id, c]));

        // Preserve the current study-session order/index: update existing
        // cards in place with fresh field data, dropping only cards that
        // were actually deleted — never ones that just fell out of "due".
        const updated = prev
          .filter((c) => freshById.has(c.id))
          .map((c) => ({ ...freshById.get(c.id)!, sessionRating: c.sessionRating }));

        // Append any newly-due cards not already in the session
        const now = new Date();
        const existingIds = new Set(prev.map((c) => c.id));
        const newCards = freshCards
          // Same studyable predicate as the deck page's selectDueCards — drafts never get
          // pulled into a running session.
          .filter((c) => !existingIds.has(c.id) && !c.is_draft && (!c.next_review_at || new Date(c.next_review_at) <= now))
          .map((c) => ({ ...c, sessionRating: null as number | null }));

        return [...updated, ...newCards];
      });
    } catch (error) {
      console.error("Error refetching cards:", error);
    }
  };

  // Edit the card being studied. Scoped to the card's OWN deck, not the session
  // source — in a collection session the card can belong to any member deck.
  const handleEditCard = async (cardId: string, front: string, back: string, notes: string | null, category: string | null, isDraft: boolean, sourceRef: string | null) => {
    const deckId = editingCard?.deck_id;

    // Client update first
    setSessionCards((prev) =>
      prev.map((c) => c.id === cardId ? { ...c, front, back, notes, category, is_draft: isDraft, source_ref: sourceRef } : c)
    );
    setEditingCard(null);

    // Background DB update + reconcile
    if (deckId) {
      await fetch(`/modules/rune/api/decks/${deckId}/cards`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, front, back, notes, category, is_draft: isDraft, source_ref: sourceRef }),
      });
    }
    reconcileCards();
  };

  // IDLE — the host page is showing its landing screen; the preload effects above
  // still run so the first card's audio/images are warm when study starts.
  if (!isActive) return null;

  // SESSION COMPLETE
  if (sessionComplete) {
    const againCount = sessionCards.filter((c) => c.sessionRating === 1).length;
    const hardCount = sessionCards.filter((c) => c.sessionRating === 2).length;
    const goodCount = sessionCards.filter((c) => c.sessionRating === 3).length;
    const easyCount = sessionCards.filter((c) => c.sessionRating === 4).length;

    return (
      <div className="page">
        <main className="page-container" style={{ maxWidth: "36rem" }}>

          {/* SESSION COMPLETE CARD */}
          <div className="card text-center">

            {/* TITLE */}
            <h2 className="text-page-title justify-center mb-2">Session Complete</h2>

            {/* DURATION */}
            <p className="text-secondary mb-6">
              {formatDuration(sessionDurationRef.current)} — {sessionCards.length} cards
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
              {/* EXIT */}
              <Button
                onClick={onExit}
                className="btn-off flex-1"
              >
                {exitLabel}
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

  // NO CARDS — nothing to study (e.g. every due card was deleted mid-session)
  if (!currentCard) {
    return (
      <div className="page">
        <main className="page-container" style={{ maxWidth: "36rem" }}>
          <div className="card text-center">
            <p className="text-secondary py-8">No cards due</p>
            <Button onClick={handleQuit} className="btn-off w-full">Back</Button>
          </div>
        </main>
      </div>
    );
  }

  // ACTIVE STUDY SESSION
  return (
    <div className="page">

      <Toaster />

      <main className="page-container rune-study-container" style={{ maxWidth: "36rem" }}>

        {/* HIDDEN AUDIO ELEMENT FOR TTS */}
        <audio ref={audioRef} preload="none" />

        {/* SESSION HEADER */}
        <div className="flex items-center justify-between mb-2">

          {/* SOURCE NAME + HANDS-FREE TOGGLE */}
          <div className="flex items-center gap-3 rune-study-header-main">
            <p className="text-subtle rune-study-deck-name">{sourceName}</p>
            <label className="flex items-center gap-1 cursor-pointer text-subtle text-xs rune-study-handsfree">
              <input
                type="checkbox"
                checked={handsFree}
                onChange={(e) => {
                  if (e.target.checked) {
                    handsFreeRef.current = true;
                    onHandsFreeChange(true);
                  } else {
                    disableHandsFree();
                  }
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
        <div className="flex items-center justify-between mb-1.5 rune-study-meta">
          <span className="text-subtle">
            CARD {currentIndex + 1} / {sessionCards.length}
          </span>
          <span className="text-subtle flex gap-2 rune-study-tally">
            <span className="text-alert-green">{sessionCards.filter((c) => c.sessionRating === 4).length} easy</span>
            <span className="text-alert-green">{sessionCards.filter((c) => c.sessionRating === 3).length} good</span>
            <span className="text-alert-yellow">{sessionCards.filter((c) => c.sessionRating === 2).length} hard</span>
            <span className="text-alert-red">{sessionCards.filter((c) => c.sessionRating === 1).length} again</span>
          </span>
        </div>

        {/* DAILY TARGET INFO (soft — global goal across all decks; max renew only warns) */}
        <div className="flex items-center justify-between mb-1.5 text-subtle text-sm rune-study-meta">
          <span className={goalMet ? "text-alert-green" : ""}>
            Today · all decks {reviewedToday} / {preferences.dailyGoal}{goalMet ? " — goal met" : ""}
          </span>
          {overMaxRenew && (
            <span className="text-alert-yellow">Past daily max of {preferences.dailyMaxRenew}</span>
          )}
        </div>

        {/* PROGRESS BAR */}
        <div className="flashcard-progress-bar mb-5">
          {sessionCards.map((card, i) => (
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

        {/* FLASH CARD */}
        <div className="flashcard-container" onClick={handleFlip}>
          {!isFlipped ? (
            <>
              {/* FRONT FACE */}
              <div className="flex items-center justify-between w-full gap-2">
                <div className="flex items-center gap-2 min-w-0 rune-study-face-badges">
                  <div className="badge-gray">QUESTION</div>

                  {/* SOURCE DECK BADGE — collection sessions only (see deck_name) */}
                  {currentCard.deck_name && (
                    <div className="badge-gray rune-study-card-deck" title={currentCard.deck_name}>
                      <Layers className="w-3 h-3 shrink-0" />
                      <span className="rune-study-card-deck-name">{currentCard.deck_name}</span>
                    </div>
                  )}
                </div>

                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isSpeaking) { stopSpeakingTracked(); disableHandsFree(); }
                    else { handleSpeakAndRecord(); }
                  }}
                  className="btn-link !p-0"
                  title={speakingSource === SpeakingSource.Question ? "Stop speaking" : "Speak question"}
                >
                  {speakingSource === SpeakingSource.Question ? <CircleStop className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </Button>
              </div>

              {/* QUESTION TEXT — no stopPropagation here (unlike the answer face
                  below): clicking anywhere on the front, including the text, is
                  "tap to reveal" and should flip the card. */}
              <div className="text-primary mt-4 flex-1 flashcard-face-scroll">
                <CardContent text={currentCard.front} />
              </div>

              {/* TAP HINT */}
              <div className="text-subtle">TAP TO REVEAL</div>
            </>
          ) : (
            <>
              {/* BACK FACE */}
              <div className="flex items-center justify-between w-full gap-2">
                <div className="flex items-center gap-2 min-w-0 rune-study-face-badges">
                  <div className="badge-gray">ANSWER</div>

                  {/* LAST RATING BADGE */}
                  {currentCard.last_rating && (
                    <div className={`badge-${currentCard.last_rating <= 2 ? (currentCard.last_rating === 1 ? "red" : "yellow") : (currentCard.last_rating === 3 ? "green" : "blue")}`}>
                      {ratingToLabel(currentCard.last_rating).toUpperCase()}
                    </div>
                  )}

                  {/* SOURCE DECK BADGE — collection sessions only (see deck_name) */}
                  {currentCard.deck_name && (
                    <div className="badge-gray rune-study-card-deck" title={currentCard.deck_name}>
                      <Layers className="w-3 h-3 shrink-0" />
                      <span className="rune-study-card-deck-name">{currentCard.deck_name}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* EDIT CARD BUTTON */}
                  <Button
                    onClick={(e) => { e.stopPropagation(); setEditingCard(currentCard); }}
                    className="btn-link !p-0"
                    title="Edit card"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>

                  {/* SPEAK ANSWER BUTTON */}
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isSpeaking) { stopSpeakingTracked(); disableHandsFree(); }
                      else if (currentCard) { speakFrom(SpeakingSource.CardAnswer, currentCard.back); }
                    }}
                    className="btn-link !p-0"
                    title={speakingSource === SpeakingSource.CardAnswer ? "Stop speaking" : "Speak answer"}
                  >
                    {speakingSource === SpeakingSource.CardAnswer ? <CircleStop className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* ANSWER TEXT + NOTES — share one scroll container (desktop only)
                  so a long answer or image-heavy notes don't push the rating
                  buttons/nav off screen; the card auto-sizes to the remaining
                  viewport space and this scrolls independently of the page.
                  Notes must live inside this div, not after it — the card
                  itself clips overflow on desktop, so anything outside the
                  scroll region (e.g. notes with embedded images) would
                  otherwise just get cut off with no way to reach it. */}
              <div className="text-primary mt-4 flex-1 flashcard-face-scroll" onClick={(e) => e.stopPropagation()}>
                {/* ANSWER — a blank back is a valid card (self-graded recall): the face just
                    carries whatever notes/source the card has, and the rating buttons below
                    are the whole interaction. */}
                {currentCard.back.trim() && <CardContent text={currentCard.back} />}

                {/* NOTES */}
                {currentCard.notes && (
                  <div className="text-subtle-italic mt-3">
                    <CardContent text={currentCard.notes} />
                  </div>
                )}

                {/* SOURCE — where the material came from, in the user's own words (a link,
                    or something like "Per Chief's lecture"). Sits below the notes, inside
                    the same scroll container: on desktop the card clips its overflow, so
                    anything rendered after this div would be unreachable. CardContent
                    autolinks a bare URL and honours [label](url). */}
                {currentCard.source_ref && (
                  <div className="rune-card-source mt-3">
                    <span className="text-subtle text-xs">Source</span>
                    <CardContent text={currentCard.source_ref} className="text-secondary rune-card-source-text" />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* YOUR ANSWER */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-subtle">YOUR ANSWER</p>

            {/* RECORD BUTTON */}
            <Button
              onClick={isRecording ? () => { stopRecording(); disableHandsFree(); } : () => { setEvaluationResult(null); setUserAnswer(""); startRecording(); }}
              disabled={isSpeaking || isTranscribing}
              className={`${isRecording ? "btn-red" : "btn-off"}`}
            >
              {isRecording ? (
                <><Square className="w-4 h-4" /> Stop</>
              ) : (
                <><Mic className="w-4 h-4" /> {isTranscribing ? "Transcribing..." : "Record"}</>
              )}
            </Button>
          </div>

          {/* USER ANSWER FIELD — Enter submits (Shift+Enter still inserts a newline).
              The handler blurs the textarea before evaluating so the on-screen keyboard
              drops on mobile; left focused it stays up and covers the evaluation result
              and the rating buttons the submit just revealed. */}
          <textarea
            className="input-field w-full"
            rows={3}
            value={userAnswer}
            onChange={(e) => { setUserAnswer(e.target.value); setAnswerModified(true); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); handleEvaluate(); } }}
            placeholder="Type or record your answer..."
            disabled={isRecording || isTranscribing}
          />
        </div>

        {/* EVALUATE BUTTON */}
        {userAnswer.trim() && (!evaluationResult || answerModified) && (
          <Button
            onClick={() => handleEvaluate()}
            disabled={isEvaluating}
            className="btn-blue w-full mt-3 py-4 text-lg"
          >
            <BrainCircuit className="w-5 h-5" />
            {isEvaluating ? "Evaluating..." : "Evaluate Answer"}
          </Button>
        )}

        {/* EVALUATION RESULT */}
        {evaluationResult && (
          <div className={`alert-${evaluationResult.correct ? "green" : evaluationResult.suggestedRating === 0 ? "yellow" : "red"} mt-3`}>
            <div className="flex items-center justify-between">
              <p className="font-semibold">
                {evaluationResult.correct ? "Correct" : evaluationResult.suggestedRating === 0 ? "Unscorable" : "Incorrect"}
              </p>
              <Button
                onClick={() => {
                  if (isSpeaking) { stopSpeakingTracked(); disableHandsFree(); }
                  else { speakFrom(SpeakingSource.Evaluation, evaluationResult.explanation); }
                }}
                className="btn-link !p-0 text-inherit opacity-60 hover:opacity-100"
                title={speakingSource === SpeakingSource.Evaluation ? "Stop speaking" : "Speak evaluation"}
              >
                {speakingSource === SpeakingSource.Evaluation ? <CircleStop className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-sm mt-1">{evaluationResult.explanation}</p>
          </div>
        )}

        {/* NAVIGATION — fixed position across the flip (see the rating buttons below) */}
        <div className="flex gap-2 mt-5">

          {/* PREV BUTTON */}
          <Button
            onClick={handlePrev}
            disabled={currentIndex === 0 || isRecording || isTranscribing}
            className="btn-off flex-1"
          >
            <ChevronLeft className="w-4 h-4" />
            PREV
          </Button>

          {/* NEXT BUTTON — also doubles as "accept suggested rating / skip" when an
              unaccepted evaluation is showing, and as "finish" on the last card
              (nothing further to advance to), so it stays enabled the whole session —
              there's always something for it to do, now that there's no dedicated
              Skip button. */}
          <Button
            onClick={handleNext}
            disabled={isRecording || isTranscribing}
            className="btn-off flex-1"
          >
            {currentIndex >= sessionCards.length - 1 && !(evaluationResult && !currentCardAlreadyRated) ? "FINISH" : "NEXT"}
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* RATING BUTTONS — below the navigation, not above it: they only exist on the
            answer face, so with the nav underneath them the flip moved PREV/NEXT out from
            under the thumb mid-session. */}
        {isFlipped && (
          <div className="flex gap-2 mt-3">
            {[
              { rating: 1, label: "AGAIN", className: "alert-red" },
              { rating: 2, label: "HARD", className: "alert-yellow" },
              { rating: 3, label: "GOOD", className: "alert-green" },
              { rating: 4, label: "EASY", className: "alert-blue" },
            ].map(({ rating, label, className }) => (
              <button
                key={rating}
                onClick={(e) => { e.stopPropagation(); handleRate(rating); }}
                style={{ "--countdown-fill-duration": `${preferences.autoAdvanceSeconds}s` } as CSSProperties}
                className={`${className} cursor-pointer text-center flex-1 ${currentCard.sessionRating === rating
                  ? "ring-2 ring-offset-2 ring-current"
                  : evaluationResult?.suggestedRating === rating && !currentCardAlreadyRated
                    ? (autoRateCountdown ? "countdown-fill ring-2 ring-offset-2 ring-current" : "ring-2 ring-offset-2 ring-current")
                    : ""
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* CARD HISTORY — this card's own record: where its SRS scheduling stands and
            every rating it has ever been given. Revealed with the answer (there is no
            point showing how a card has gone before you have tried to recall it, and on
            the front face it would leak the difficulty), and placed below the rating
            buttons and navigation so it informs the rating without displacing it. The
            data is already warmed by the preload buffer above, so the flip shows it
            immediately rather than a spinner. */}
        {isFlipped && currentCard && (
          <div className="card mt-4">

            {/* CARD HEADER */}
            <div className="card-header">
              <h2 className="text-card-title">
                <History className="w-5 h-5" />
                Card History
              </h2>

              {/* HELP — Ease and Interval are scheduler internals, and the numbers here
                  are this card's alone, not the session's; neither is guessable. */}
              <HelpButton
                title="Card History"
                sections={[
                  { heading: "What this is", body: "The record of the card you are looking at — every time you have rated it before, and where its scheduling currently stands. It appears with the answer, so the card's past difficulty can't give away the answer before you have tried to recall it." },
                  { heading: "Reviews / Good or better", body: "How many times this card has been rated, and the share of those ratings that were Good or Easy. A low percentage on a card you keep seeing is the sign it needs rewording rather than more repetitions." },
                  { heading: "Ease and Interval", body: "The scheduler's current state for this card: Ease is the multiplier the gap grows by (it drops when you rate Again or Hard), Interval is the gap it last scheduled. Next Review is when the card would next come due — \"Due\" means it is due now, which it is while you are studying it." },
                  { heading: "Recall over time", body: "Each past rating plotted against when it happened — Again at the floor, Easy at the ceiling. The x axis is real time, so as a card is learned its dots spread out to the right. Tap a dot for its date and rating." },
                  { heading: "The table", body: "Every rating, newest first, with the time it took to answer where that was recorded. A rating you give this session appears here immediately, so stepping back to a card with PREV shows what you just gave it." },
                ]}
              />
            </div>

            {/* CARD CONTENT */}
            <div className="card-content">
              <CardHistoryPanel
                card={currentCard}
                reviews={currentCardHistory ?? []}
                isLoading={!currentCardHistory && !currentCardHistoryFailed}
                loadFailed={currentCardHistoryFailed}
                collapsedRows={HISTORY_COLLAPSED_ROWS}
                emptyBody="This is the first time this card has come up in a study session."
                failureBody="Rate the card as usual — only this history is missing."
              />
            </div>
          </div>
        )}

        {/* MANAGE CARD MODAL (edit from study session) */}
        <ManageCardModal
          isOpen={!!editingCard}
          editCard={editingCard}
          onClose={() => setEditingCard(null)}
          onAdd={async () => { /* adding isn't offered mid-session */ }}
          onEdit={handleEditCard}
          existingCategories={existingCategories}
        />
      </main>
    </div>
  );
}
