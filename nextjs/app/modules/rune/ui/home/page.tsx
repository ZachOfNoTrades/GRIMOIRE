"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Boxes, Layers, Play, Settings, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/linkButton";
import HelpButton from "@/components/ui/HelpButton";
import { formatRelativePast } from "@/lib/format";
import { DeckSummary } from "../../types/deck";
import { DEFAULT_DAILY_GOAL, DEFAULT_DAILY_MAX_RENEW } from "../../types/settings";

export default function RuneHomePage() {

  // DATA
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  // Global (all-decks) soft daily targets + today's distinct-card review count.
  const [dailyGoal, setDailyGoal] = useState<number>(DEFAULT_DAILY_GOAL);
  const [dailyMaxRenew, setDailyMaxRenew] = useState<number>(DEFAULT_DAILY_MAX_RENEW);
  const [reviewedToday, setReviewedToday] = useState<number>(0);

  // STATE
  const [isLoading, setIsLoading] = useState(true);

  // LOAD DATA
  useEffect(() => {
    fetchDecks();
  }, []);

  // LOAD DAILY TARGETS — global progress shown in the Overview card. Best-effort.
  useEffect(() => {
    let cancelled = false;
    fetch("/modules/rune/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (Number.isFinite(data.dailyGoal)) setDailyGoal(data.dailyGoal);
        if (Number.isFinite(data.dailyMaxRenew)) setDailyMaxRenew(data.dailyMaxRenew);
        if (Number.isFinite(data.reviewedToday)) setReviewedToday(data.reviewedToday);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
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

  // DERIVED STATS
  const totalDue = decks.reduce((sum, deck) => sum + deck.due_count, 0);
  const goalMet = reviewedToday >= dailyGoal;
  const overMaxRenew = reviewedToday >= dailyMaxRenew;
  const mostDueDeck = decks
    .filter((deck) => deck.due_count > 0)
    .sort((a, b) => b.due_count - a.due_count)[0] ?? null;
  const lastStudiedDeck = decks
    .filter((deck) => deck.last_reviewed_at)
    .sort((a, b) => new Date(b.last_reviewed_at!).getTime() - new Date(a.last_reviewed_at!).getTime())[0] ?? null;

  return (

    // PAGE
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* PAGE HEADER */}
        <div className="mb-8 flex items-center justify-between gap-2">

          {/* PAGE TITLE */}
          <h1 className="text-page-title">
            <BookOpen className="w-8 h-8" />
            Flash Cards
          </h1>

          {/* HELP */}
          <HelpButton
            title="Flash Cards"
            sections={[
              { heading: "Getting started", body: "Create a deck, then add cards manually or use Generate Cards to draft a set with the LLM from a topic or your notes." },
              { heading: "Studying", body: "Resume Studying jumps to the deck with cards due. Flip each card, then rate how well you knew it — spaced repetition schedules the next review automatically." },
              { heading: "Collections", body: "A collection groups several decks. Open it and start a study session to review every due card across those decks in one pass — useful for related decks you always study together." },
              { heading: "Pausing a deck", body: "Open a deck and press the power button to disable it. A disabled deck stops counting toward Cards Due here, the dashboard badge and the daily review email, and collection study sessions skip it — but nothing is reset, and you can still study it from its own page. Press the button again to bring it back." },
              { heading: "List or table view", body: "A deck's card list has a view toggle beside the sort control. The list shows one card's back at a time; the table lays every card's front and back out side by side (stacked on a phone) so you can read or proofread a whole deck in one pass. Search, filter and sort apply to both, and the page widens for the table. Your choice is remembered." },
              { heading: "Card origin", body: "Expand a card in its deck to see when it was created, when it was last edited, and which client each of those came through — the web app, a direct API call, or an MCP tool. Cards added before this was tracked show the dates without a client. It is deliberately absent during a study session, where only the card itself should be on screen." },
              { heading: "Sharing a deck", body: "Open a deck, then Share deck in its menu. Enter an email and pick Can view (read and study it) or Can edit (also change its cards and details). They find it in their Decks list once they sign in to GRIMOIRE with that address — you won't be told whether they have an account. Everyone studies on their own schedule. Only you can share or delete the deck; someone you shared with can remove it from their own list." },
              { heading: "Refine & configure", body: "Use LLM refinement to tighten card wording across a deck. Deck options and defaults live in Settings." },
            ]}
          />
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex gap-3 mb-6">

          {/* RESUME STUDYING BUTTON — only when a deck has cards due */}
          {mostDueDeck && (
            <LinkButton
              className="btn-blue"
              href={`/modules/rune/ui/decks/${mostDueDeck.id}`}
            >
              <Play className="w-4 h-4" />
              Resume Studying
            </LinkButton>
          )}

          {/* GENERATE CARDS BUTTON */}
          <LinkButton
            className="btn-blue"
            href="/modules/rune/ui/decks/generate"
          >
            <Zap className="w-4 h-4" />
            Generate Cards
          </LinkButton>
        </div>

        {/* OVERVIEW DASHBOARD CARD */}
        <div className="card mb-6">

          {/* HEADER */}
          <div className="card-header">
            <h2 className="text-card-title">
              <Layers className="w-5 h-5" />
              Overview
            </h2>
          </div>

          {/* STATS */}
          <div className="card-content">
            {isLoading ? (

              // LOADING PLACEHOLDER
              <div className="loading-container">
                <div className="loading-spinner" />
              </div>
            ) : (

              // STAT CARDS
              <div className="stat-section">

                {/* TOTAL DECKS */}
                <div className="stat-card">
                  <p className="stat-label">Decks</p>
                  <p className="stat-value">{decks.length}</p>
                </div>

                {/* CARDS DUE */}
                <div className="stat-card">
                  <p className="stat-label">Cards Due</p>
                  <p className="stat-value">{totalDue}</p>
                </div>

                {/* TODAY'S PROGRESS — global daily goal across all decks */}
                <div className="stat-card">
                  <p className="stat-label">Today</p>
                  <p className={`stat-value ${goalMet ? "text-alert-green" : ""}`}>
                    {reviewedToday}
                    <span className="text-subtle text-base"> / {dailyGoal}</span>
                  </p>
                </div>

                {/* LAST STUDIED */}
                <div className="stat-card">
                  <p className="stat-label">Last Studied</p>
                  <p className="stat-value text-base">
                    {lastStudiedDeck ? formatRelativePast(lastStudiedDeck.last_reviewed_at) : "-"}
                  </p>
                </div>
              </div>
            )}

            {/* DAILY MAX RENEW WARNING (soft — never blocks study) */}
            {!isLoading && overMaxRenew && (
              <p className="text-alert-yellow text-sm mt-3">
                You&apos;ve reviewed {reviewedToday} cards today, past your daily max of {dailyMaxRenew}. Nothing is hidden — this is just a nudge to rest.
              </p>
            )}
          </div>
        </div>

        {/* NAVIGATION CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* DECKS CARD */}
          <Link href="/modules/rune/ui/decks">
            <div className="module-card">
              <h2 className="text-card-title">
                <Layers className="w-5 h-5" />
                Decks
              </h2>
            </div>
          </Link>

          {/* COLLECTIONS CARD — grouped decks, studied as one session */}
          <Link href="/modules/rune/ui/collections">
            <div className="module-card">
              <h2 className="text-card-title">
                <Boxes className="w-5 h-5" />
                Collections
              </h2>
            </div>
          </Link>

          {/* SETTINGS CARD */}
          <Link href="/modules/rune/ui/settings">
            <div className="module-card">
              <h2 className="text-card-title">
                <Settings className="w-5 h-5" />
                Settings
              </h2>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
