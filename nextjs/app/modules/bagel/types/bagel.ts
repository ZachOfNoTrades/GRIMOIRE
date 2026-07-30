// Shared types for the Bagel (Pico Fermi Bagel) module.

export type GameStatus = "active" | "won" | "lost" | "skipped";

// A single scored guess in a game's history.
export interface BagelGuess {
  seq: number;
  guess: string;
  fermi: number;
  pico: number;
  clue: string;
}

// The client-safe view of a game. `secret` is only ever populated once the
// game is over (won/lost) — never while it is still active.
export interface BagelGame {
  id: string;
  num_digits: number;
  max_guesses: number;
  status: GameStatus;
  num_guesses: number;
  guesses: BagelGuess[];
  secret: string | null;
  ts_created: string;
}

// A row in the game history table — same shape as BagelGame but without the
// per-guess history (the list view doesn't need it).
export interface BagelGameHistoryItem {
  id: string;
  num_digits: number;
  max_guesses: number;
  status: GameStatus;
  num_guesses: number;
  secret: string | null;
  ts_created: string;
}

// Aggregate stats shown on the home screen.
export interface BagelStats {
  games_played: number;
  games_won: number;
  win_rate: number; // 0-1
  best_guesses: number | null; // fewest guesses in any win
  current_streak: number; // consecutive wins, most-recent-first
}
