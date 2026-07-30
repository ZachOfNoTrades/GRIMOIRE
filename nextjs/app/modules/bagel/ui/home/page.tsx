"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Toaster, toast } from "react-hot-toast";
import { ArrowLeft, Donut, HelpCircle, History, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppHeight } from "@/lib/useAppHeight";
import ConfirmModal from "@/components/ConfirmModal";
import { SettingsGroup } from "@/components/settings/SettingsList";
import GuessHistory from "../../components/GuessHistory";
import { BagelGame, BagelStats } from "../../types/bagel";

/* Difficulty options — must stay within DIGIT_RANGE on the server (3-5). */
const DIFFICULTIES = [
  { digits: 3, label: "3 · Easy" },
  { digits: 4, label: "4 · Medium" },
  { digits: 5, label: "5 · Hard" },
] as const;

export default function BagelHomePage() {
  const router = useRouter();

  // Keyboard-aware shell height: the guess input lives near the bottom of the
  // locked `.page` shell, whose height is pinned to 100lvh on Firefox Android and
  // never shrinks when the soft keyboard opens — leaving the input (and what you
  // type) hidden behind the keyboard with no scroll room to lift it. Mounting
  // this makes --visible-vh track the keyboard so `.page-keyboard-aware` shrinks
  // the shell, giving the scroller room to bring the input into view.
  useAppHeight();

  // DATA — server-owned game + aggregate stats.
  const [game, setGame] = useState<BagelGame | null>(null);
  const [stats, setStats] = useState<BagelStats | null>(null);

  // INPUT — chosen difficulty for the next game + the current guess text.
  const [difficulty, setDifficulty] = useState<number>(3);
  const [guess, setGuess] = useState<string>("");

  // STATE — UI flags. Derived `isActive` sits with the state it depends on.
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [showGiveUpModal, setShowGiveUpModal] = useState(false);
  const isActive = game?.status === "active";
  const inputRef = useRef<HTMLInputElement>(null);

  // INITIAL LOAD — fetch stats and resume any in-progress game. The current game is looked
  // up server-side (not a client-side pointer), so navigating away mid-game and coming back
  // — even from a different device or a cleared cache — always resumes the same active game.
  useEffect(() => {
    async function init() {
      try {
        await refreshStats();
        const res = await fetch("/modules/bagel/api/games/current");
        if (res.ok) {
          const current: BagelGame | null = await res.json();
          if (current) {
            setGame(current);
            setDifficulty(current.num_digits);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  // Scrolls the guess input clear of the soft keyboard. Runs on every focus — the
  // manual tap that opens the keyboard, the initial autofocus, and the
  // programmatic re-focus after each guess. `block: "end"` pins the input's bottom
  // to the visible-area bottom (the keyboard top on Firefox Android, once the
  // keyboard-aware shell has shrunk — see useAppHeight), keeping the input and
  // Guess button in view even as new guess rows push them down the list. Scrolled
  // immediately and again after a short delay to catch the keyboard's open
  // animation, which is what actually shrinks the shell and frees the scroll room.
  const scrollInputAboveKeyboard = useCallback(() => {
    const input = inputRef.current;
    input?.scrollIntoView({ block: "end" });
    setTimeout(() => input?.scrollIntoView({ block: "end" }), 350);
  }, []);

  // Keep focus on the input whenever a fresh active game is ready for a guess,
  // and bring it above the keyboard. Covers game start and the re-focus after each
  // guess — where the keyboard is already up (readOnly holds it) so no onFocus
  // fires, but a new guess row has just pushed the input down.
  useEffect(() => {
    if (!isActive) return;
    inputRef.current?.focus();
    scrollInputAboveKeyboard();
  }, [isActive, game?.num_guesses, scrollInputAboveKeyboard]);

  // The onFocus/effect scrolls fire when focus is GAINED, but the input is already
  // autofocused when the user taps it to raise the keyboard — so no focus event
  // fires and nothing scrolls it clear. The soft keyboard opening instead shows up
  // as a visualViewport resize: when it shrinks the viewport while the input is
  // focused, scroll the input above the keyboard.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const onViewportResize = () => {
      const keyboardOpen = window.innerHeight - viewport.height > 100;
      if (keyboardOpen && document.activeElement === inputRef.current) {
        inputRef.current?.scrollIntoView({ block: "end" });
      }
    };
    viewport.addEventListener("resize", onViewportResize);
    return () => viewport.removeEventListener("resize", onViewportResize);
  }, []);

  async function refreshStats() {
    try {
      const res = await fetch("/modules/bagel/api/stats");
      if (res.ok) setStats(await res.json());
    } catch (e) {
      console.error(e);
    }
  }

  async function startGame() {
    setError(null);
    setGuess("");
    setIsBusy(true);
    try {
      const res = await fetch("/modules/bagel/api/games", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ num_digits: difficulty }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to start game");
      }
      const fresh: BagelGame = await res.json();
      setGame(fresh);
      setDifficulty(fresh.num_digits);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start game");
    } finally {
      setIsBusy(false);
    }
  }

  async function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    if (!game || !isActive || isBusy) return;
    setError(null);
    setIsBusy(true);
    try {
      const res = await fetch(`/modules/bagel/api/games/${game.id}/guess`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ guess }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 400 validation messages are shown inline, not as a toast.
        setError(data.error ?? "Invalid guess");
        return;
      }
      setGame(data.game);
      setGuess("");

      // GAME OVER — celebrate / commiserate, refresh stats.
      if (data.game.status !== "active") {
        await refreshStats();
        if (data.won) {
          toast.success(`Solved in ${data.game.num_guesses}!`);
        } else {
          toast.error(`Out of guesses — it was ${data.game.secret}`);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit guess");
    } finally {
      setIsBusy(false);
    }
  }

  // Ends the active game early server-side (revealing the secret), so it stops being
  // resumed as "current" the next time the module loads. "skipped" doesn't count toward
  // stats; "lost" counts as a real loss, same as running out of guesses.
  async function endGame(reason: "skipped" | "lost") {
    if (!game) return;
    setShowSkipModal(false);
    setShowGiveUpModal(false);
    setIsBusy(true);
    try {
      const res = await fetch(`/modules/bagel/api/games/${game.id}/abandon`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error("Failed to end game");
      const updated: BagelGame = await res.json();
      setGame(updated);
      await refreshStats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to end game");
    } finally {
      setIsBusy(false);
    }
  }

  // LOADING PLACEHOLDER
  if (isLoading) {
    return (
      <div className="page page-keyboard-aware">
        <div className="page-container">
          <div className="loading-container">
            <div className="loading-spinner" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page-keyboard-aware">
      <div className="page-container">
        <Toaster position="top-center" />

        {/* HEADER ROW */}
        <div className="flex items-center justify-between mb-6">

          {/* BACK TO DASHBOARD */}
          <Button
            className="btn-link !pl-0"
            onClick={() => router.push("/dashboard")}
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          {/* RULES TOGGLE */}
          <Button
            className="btn-link"
            onClick={() => setShowRules((s) => !s)}
            aria-label="How to play"
          >
            <HelpCircle className="w-5 h-5" />
          </Button>
        </div>

        {/* PAGE TITLE */}
        <h1 className="text-page-title">
          <Donut className="w-7 h-7" /> Bagel
        </h1>

        {/* PAGE SUBTITLE */}
        <p className="text-page-subtitle mb-6">
          Pico Fermi Bagel — crack the secret number of unique digits.
        </p>

        {/* RULES CARD */}
        {showRules && (
          <div className="alert-blue mb-6">

            {/* RULES TITLE */}
            <div className="alert-title">How to play</div>

            {/* RULES BODY */}
            <div className="alert-text">
              I pick a secret number whose digits are all different. After each guess
              I give clues, sorted so they don't reveal which digit is which:
              <ul className="list-disc ml-5 mt-2 space-y-1">

                {/* FERMI RULE */}
                <li><strong>Fermi</strong> — a digit is correct and in the right spot.</li>

                {/* PICO RULE */}
                <li><strong>Pico</strong> — a digit is correct but in the wrong spot.</li>

                {/* BAGELS RULE */}
                <li><strong>Bagels</strong> — no digit is correct.</li>
              </ul>
            </div>
          </div>
        )}

        {/* STATS ROW */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">

            {/* PLAYED */}
            <div className="stat-card">
              <div className="stat-label">Played</div>
              <div className="stat-value">{stats.games_played}</div>
            </div>

            {/* WIN RATE */}
            <div className="stat-card">
              <div className="stat-label">Win rate</div>
              <div className="stat-value">{Math.round(stats.win_rate * 100)}%</div>
            </div>

            {/* BEST */}
            <div className="stat-card">
              <div className="stat-label">Best</div>
              <div className="stat-value">{stats.best_guesses ?? "—"}</div>
            </div>

            {/* STREAK */}
            <div className="stat-card">
              <div className="stat-label">Streak</div>
              <div className="stat-value">{stats.current_streak}</div>
            </div>
          </div>
        )}

        {/* GAME CARD */}
        <div className="card">

          {/* NO ACTIVE GAME — difficulty picker + start button */}
          {!isActive && (
            <div className="card-content">

              {/* PREVIOUS RESULT BANNER */}
              {game && game.status === "won" && (
                <div className="alert-green">
                  <div className="alert-title">
                    <Trophy className="w-4 h-4" /> Solved in {game.num_guesses}!
                  </div>
                  <div className="alert-text">The number was {game.secret}.</div>
                </div>
              )}

              {/* PREVIOUS RESULT BANNER — loss */}
              {game && game.status === "lost" && (
                <div className="alert-red">
                  <div className="alert-title">Out of guesses</div>
                  <div className="alert-text">The number was {game.secret}.</div>
                </div>
              )}

              {/* PREVIOUS RESULT BANNER — skipped */}
              {game && game.status === "skipped" && (
                <div className="alert-blue">
                  <div className="alert-title">Skipped</div>
                  <div className="alert-text">The number was {game.secret}.</div>
                </div>
              )}

              {/* DIFFICULTY LABEL */}
              <div className="text-h2">Difficulty</div>

              {/* DIFFICULTY PICKER */}
              <div className="flex flex-wrap gap-2">
                {DIFFICULTIES.map((d) => (
                  <Button
                    key={d.digits}
                    className={difficulty === d.digits ? "btn-blue" : "btn-off"}
                    onClick={() => setDifficulty(d.digits)}
                  >
                    {d.label}
                  </Button>
                ))}
              </div>

              {/* START BUTTON */}
              <Button className="btn-green mt-2" onClick={startGame} disabled={isBusy}>
                {game ? "New Game" : "Start Game"}
              </Button>
            </div>
          )}

          {/* ACTIVE GAME — history + guess input */}
          {isActive && game && (
            <div className="card-content">

              {/* PROGRESS LINE */}
              <div className="text-secondary">
                {game.num_digits} digits · guess {game.num_guesses + 1} of {game.max_guesses}
              </div>

              {/* GUESS HISTORY */}
              {game.guesses.length > 0 && (
                <GuessHistory guesses={game.guesses} />
              )}

              {/* GUESS FORM */}
              <form onSubmit={submitGuess} className="flex flex-col gap-2 mt-2">

                {/* GUESS INPUT ROW */}
                <div className="flex gap-2">

                  {/* GUESS INPUT */}
                  <input
                    ref={inputRef}
                    className="input-field"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    maxLength={game.num_digits}
                    placeholder={`${game.num_digits} unique digits`}
                    value={guess}
                    onChange={(e) => {
                      setGuess(e.target.value.replace(/\D/g, "").slice(0, game.num_digits));
                      setError(null);
                    }}
                    onFocus={scrollInputAboveKeyboard}
                    // readOnly (not disabled) while a guess is in flight: disabling a
                    // focused input blurs it, which dismisses the mobile soft keyboard
                    // on Enter. readOnly keeps focus so the keyboard stays up between guesses.
                    readOnly={isBusy}
                  />

                  {/* SUBMIT */}
                  <Button
                    type="submit"
                    className="btn-blue"
                    disabled={isBusy || guess.length !== game.num_digits}
                  >
                    Guess
                  </Button>
                </div>

                {/* VALIDATION ERROR */}
                {error && <div className="alert-red alert-text">{error}</div>}
              </form>

              {/* SKIP / GIVE UP */}
              <div className="flex justify-center gap-2 mt-1">

                {/* SKIP */}
                <Button
                  className="btn-link"
                  onClick={() => setShowSkipModal(true)}
                  disabled={isBusy}
                >
                  Skip
                </Button>

                {/* GIVE UP */}
                <Button
                  className="btn-link-red"
                  onClick={() => setShowGiveUpModal(true)}
                  disabled={isBusy}
                >
                  Give up
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* NAVIGATION MENU */}
        <div className="mt-6">
          <SettingsGroup
            rows={[
              {
                icon: History,
                label: "History",
                onClick: () => router.push("/modules/bagel/ui/history"),
              },
            ]}
          />
        </div>

        {/* SKIP MODAL */}
        <ConfirmModal
          isOpen={showSkipModal}
          onConfirm={() => endGame("skipped")}
          onCancel={() => setShowSkipModal(false)}
          title="Skip this game?"
          message="This won't count toward your stats or streak — as if this game never happened."
          confirmLabel="Skip"
        />

        {/* GIVE UP MODAL */}
        <ConfirmModal
          isOpen={showGiveUpModal}
          onConfirm={() => endGame("lost")}
          onCancel={() => setShowGiveUpModal(false)}
          title="Give up?"
          message="This counts as a loss, same as running out of guesses."
          confirmLabel="Give up"
          danger
        />
      </div>
    </div>
  );
}
